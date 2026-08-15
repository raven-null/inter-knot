/**
 * Agent 共享类型：workflow 事件定义。
 * 与前端 app/types/entities.ts 的 AiWorkflowEvent 协议保持一致
 * （type / stepId / seq / at / data / usage），供工具层与执行器共用。
 */

export interface AiWorkflowEvent {
  type: string;
  stepId: string;
  seq: number;
  at: string;
  data?: Record<string, unknown>;
  usage?: { promptTokens?: number; completionTokens?: number };
}
