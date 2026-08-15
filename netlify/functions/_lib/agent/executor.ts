/**
 * Fairy Agent 执行器：把用户消息交给智谱 GLM（带工具定义），
 * 解析 tool_calls → 执行工具 → 结果回填 → 再问，直到得到最终回答。
 *
 * 输出：
 * - `content`：最终回答文本（落库为 AI 消息正文）
 * - `workflow`：完整事件序列（tool.start / tool.finish / answer 等），
 *   落库到 AI 消息的 workflow 字段，前端 AiReasoningBlock 直接展示时间线。
 */

import { generateGlmRaw } from "../glm";
import { executeTool, TOOL_SCHEMAS, frame, type ToolContext } from "./tools";
import type { AiWorkflowEvent } from "./types";

/** 单轮最多执行几个工具调用（防止模型一次发一串） */
const MAX_TOOL_CALLS_PER_ROUND = 5;
/** 最多几轮「工具 → 再问」（防止死循环） */
const MAX_TOOL_ROUNDS = 3;
/** 工具结果回填时的总长度上限 */
const MAX_TOOL_RESULT_CHARS = 6000;

export interface AgentOutput {
  content: string;
  workflow: AiWorkflowEvent[];
}

export interface AgentOptions {
  /** 是否启用工具调用（默认开） */
  enableTools?: boolean;
  /** 注入的 workflow 起始 seq（同一消息多次生成时续接） */
  baseSeq?: number;
  /** 事件实时回调（SSE 流式用）：每个 workflow 事件生成时同步推送 */
  onEvent?: (event: AiWorkflowEvent) => void;
}

function createWorkflowSink(
  baseSeq: number,
  onEvent?: (event: AiWorkflowEvent) => void,
): {
  events: AiWorkflowEvent[];
  emit: (event: Omit<AiWorkflowEvent, "seq" | "at">) => void;
} {
  let seq = baseSeq;
  const events: AiWorkflowEvent[] = [];
  return {
    events,
    emit: (event) => {
      seq += 1;
      const full = { ...event, seq, at: new Date().toISOString() } as AiWorkflowEvent;
      events.push(full);
      onEvent?.(full);
    },
  };
}

/** 把工具结果压进后续请求（裁剪 + 数据帧防注入） */
function toolResultMessage(toolCallId: string, resultText: string): {
  role: "tool";
  tool_call_id: string;
  content: string;
} {
  const clipped = resultText.length > MAX_TOOL_RESULT_CHARS
    ? `${resultText.slice(0, MAX_TOOL_RESULT_CHARS)}…（已截断）`
    : resultText;
  return { role: "tool", tool_call_id: toolCallId, content: frame(clipped) };
}

/**
 * 执行一次带工具的 Agent 对话。
 * @param messages 基础消息（system + 历史 + 当前用户消息；不含工具结果）。
 *                 有记忆时会在 system 消息后追加一条记忆上下文（调用方无需处理）。
 * @param viewer 当前用户（工具权限判断；null 表示游客）
 * @param authHeader 原始 Authorization header（工具以该身份执行）
 */
export async function runAgent(
  messages: Array<{ role: string; content: string }>,
  viewer: { userId: string; isAdmin: boolean } | null,
  authHeader: string | null,
  options: AgentOptions = {},
): Promise<AgentOutput> {
  const sink = createWorkflowSink(options.baseSeq ?? 0, options.onEvent);
  const ctx: ToolContext = {
    authHeader,
    // 工具层只消费 userId / isAdmin 两个字段（权限判断），AuthUser 完全兼容
    viewer,
    emit: sink.emit,
  };

  // ── 长期记忆注入：把用户显式告知的记忆作为上下文附在 system 之后 ──
  let working: Array<Record<string, unknown>> = [...messages];
  if (viewer) {
    const { getMemoryTexts } = await import("./memory");
    const memories = await getMemoryTexts(viewer.userId);
    if (memories.length > 0) {
      const memoryContext = [
        "【你对这位用户的长期记忆（仅用于个性化语气与推荐，不要逐字复述给用户）】",
        ...memories.slice(0, 8).map((m, i) => `${i + 1}. ${m}`),
      ].join("\n");
      working = [...working];
      const sysIdx = working.findIndex((m) => m.role === "system");
      if (sysIdx >= 0) {
        working.splice(sysIdx + 1, 0, { role: "user", content: memoryContext });
      } else {
        working.unshift({ role: "user", content: memoryContext });
      }
    }
  }

  const enableTools = options.enableTools !== false;
  if (!enableTools) {
    const result = await generateGlmRaw(messages, { tools: undefined });
    sink.emit({ type: "answer.finish", stepId: "answer", data: {} });
    return { content: result.content, workflow: sink.events };
  }

  // 会话消息 → GLM 消息列表（可变，工具结果会追加；memory 注入已在上面完成）
  const workingMsgs = working as Array<{ role: string; content: string | null }>;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    // ── 全站 GLM 每日预算：超出后本轮不再调 GLM，直接降级 ──
    const { consumeGlmBudget } = await import("./ratelimit");
    if (!(await consumeGlmBudget())) {
      sink.emit({ type: "error", stepId: "glm-budget", data: { message: "今日 AI 调用预算已用尽" } });
      sink.emit({ type: "answer.finish", stepId: "answer", data: {} });
      return {
        content: "（Fairy 今日的算力预算已经用尽啦，明天再来找我吧～）",
        workflow: sink.events,
      };
    }

    const result = await generateGlmRaw(workingMsgs, {
      tools: TOOL_SCHEMAS,
    });

    // 无工具调用：直接作为最终回答
    if (!result.toolCalls.length) {
      sink.emit({ type: "answer.finish", stepId: "answer", data: {} });
      return { content: result.content, workflow: sink.events };
    }

    // 有工具调用：先回填 assistant 消息（含 tool_calls），再执行工具
    sink.emit({ type: "tool.round", stepId: `round-${round}`, data: { count: result.toolCalls.length } });
    working.push({
      role: "assistant",
      content: result.content || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });

    const executed = result.toolCalls.slice(0, MAX_TOOL_CALLS_PER_ROUND);
    for (const tc of executed) {
      let parsed: unknown = null;
      try {
        parsed = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        parsed = {};
      }
      const toolResult = await executeTool(tc.name, parsed, ctx);
      working.push(toolResultMessage(tc.id, toolResult.text) as Record<string, unknown>);
    }
  }

  // 达到轮数上限：给最后一次机会直接回答（不带工具）
  sink.emit({ type: "error", stepId: "round-limit", data: { message: "工具调用次数过多，已停止" } });
  const final = await generateGlmRaw(working as Array<{ role: string; content: string | null }>, {
    tools: undefined,
  });
  sink.emit({ type: "answer.finish", stepId: "answer", data: {} });
  return { content: final.content, workflow: sink.events };
}
