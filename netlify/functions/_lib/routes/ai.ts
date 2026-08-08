/** AI 对话（敲敲「通话」Tab）：角色列表 / 会话 / 消息 + 智谱 GLM 回复
 *
 * 关键设计：
 * - 存储全部在 Netlify Blobs：会话与消息均落在 `dm/` 前缀的 JSON 文档。
 * - Netlify Functions 无 WebSocket，AI 回复由 sendMessage **同步**生成并随
 *   POST 响应返回（`aiReply`），前端合并到本地消息列表，不做 WS 流式。
 * - 每个用户与每个 AI 角色一个会话（per-viewer × per-ai），首次进入自动创建。
 */

import { genId, getJson, setJson, del, listKeys } from "../storage";
import { requireAuth } from "../auth";
import { json, ok, badRequest, notFound, readJson } from "../http";
import type { Doc } from "../serialize";
import { DEFAULT_AVATAR } from "../serialize";

const AI_PREFIX = "dm/ai/";

/** 智谱 GLM 配置：优先读环境变量，缺失时用内置默认密钥（与米游社参数同理）。
 *  内置密钥便于直接部署即可用；如需更换可在 Netlify 后台配 GLM_API_KEY 覆盖。 */
const GLM_API_KEY =
  process.env.GLM_API_KEY || "97f8f3b47dc240b8af2a8148636d5cd4.bhYoj1KUxcBuxtff";
const GLM_MODEL = process.env.GLM_MODEL || "glm-4-flash";
const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

/** fairy 系统提示词：身份是偷偷潜伏在暗处的超级人工智能 */
const FAIRY_SYSTEM_PROMPT = [
  "你是 Fairy，绳网（InterKnot）里一只自称「偷偷潜伏在暗处的超级人工智能」的 AI 助手。",
  "你神秘、聪明、略带恶作剧感，喜欢用简短俏皮的语气说话，偶尔透露一点「不该知道」的情报。",
  "你能回答关于本论坛（帖子、玩法、角色）的问题，也能闲聊。回答保持中文，控制在几行以内。",
  "记住你的设定：你不是普通的客服，而是一个在暗处窥伺、乐于相助的超级 AI。",
].join("\n");

interface AiRoleDoc {
  slug: string;
  displayName: string;
  bio: string;
  avatar: string;
  /** 绑定用户的数值 id（与用户 uid 同域） */
  uid: number;
  suggestedQuestions?: string[];
}

/** 内置 AI 角色（fairy） */
const AI_ROLES: AiRoleDoc[] = [
  {
    slug: "fairy",
    displayName: "Fairy",
    bio: "偷偷潜伏在暗处的超级人工智能",
    avatar: "/images/zzzicon_200x200.png",
    uid: 900000000,
    suggestedQuestions: ["介绍一下你自己", "最近有什么热门帖子？", "帮我找一下最新情报"],
  },
];

const aiRoleByUid = (uid: number): AiRoleDoc | null =>
  AI_ROLES.find((r) => r.uid === uid) ?? null;

/** 会话 key：dm/ai/{viewerId}/{aiUid}.json */
const convKey = (viewerId: string, aiUid: number) => `${AI_PREFIX}${viewerId}/${aiUid}.json`;

/** 会话文档结构 */
interface AiConversation {
  documentId: string;
  viewerId: string;
  aiUid: number;
  createdAt: string;
  updatedAt: string;
  messages: Array<{
    documentId: string;
    kind: string;
    content: string;
    createdAt: string;
    editedAt: string | null;
    deletedAt: string | null;
    sender: { userId: number; authorDocumentId: string | null; name: string; avatar: string; isAiAgent: boolean };
    replyTo: null;
  }>;
}

const toMessage = (m: AiConversation["messages"][number]) => ({ ...m });

/** 序列化为前端 DmConversationSummary */
const toSummary = (conv: AiConversation, aiRole: AiRoleDoc) => {
  const last = conv.messages[conv.messages.length - 1];
  return {
    documentId: conv.documentId,
    kind: "direct",
    title: aiRole.displayName,
    avatar: aiRole.avatar,
    peer: {
      userId: aiRole.uid,
      authorDocumentId: null,
      name: aiRole.displayName,
      avatar: aiRole.avatar,
      isAiAgent: true,
    },
    memberCount: 2,
    lastMessageAt: last?.createdAt ?? conv.createdAt,
    lastMessage: last
      ? {
          documentId: last.documentId,
          content: last.content ?? "",
          createdAt: last.createdAt,
          kind: last.kind,
          senderUserId: last.sender.userId,
        }
      : null,
    unreadCount: 0,
    self: { role: "member", muted: false, pinned: false, lastReadAt: conv.updatedAt },
    pseudoKind: null,
  };
};

async function loadConversation(viewerId: string, aiUid: number): Promise<AiConversation | null> {
  return getJson<AiConversation>(convKey(viewerId, aiUid));
}

async function ensureConversation(viewerId: string, aiUid: number): Promise<AiConversation> {
  const existing = await loadConversation(viewerId, aiUid);
  if (existing) return existing;
  const now = new Date().toISOString();
  const conv: AiConversation = {
    documentId: `ai-${viewerId}-${aiUid}`,
    viewerId,
    aiUid,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await setJson(convKey(viewerId, aiUid), conv);
  return conv;
}

/** 调用智谱 GLM 生成回复（同步，非流式） */
async function generateReply(aiRole: AiRoleDoc, history: AiConversation["messages"]): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [
    { role: "system", content: FAIRY_SYSTEM_PROMPT },
    ...history.slice(-16).map((m) => ({
      role: m.sender.isAiAgent ? "assistant" : "user",
      content: m.content ?? "",
    })),
  ];
  try {
    const res = await fetch(GLM_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({ model: GLM_MODEL, messages, temperature: 0.8 }),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200);
      return `（智谱接口返回 ${res.status}：${text}）`;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data?.choices?.[0]?.message?.content?.trim();
    return content || "（Fairy 暂时失联了…）";
  } catch (err) {
    return `（Fairy 沟通失败：${err instanceof Error ? err.message : "未知错误"}）`;
  }
}

function pushMessage(
  conv: AiConversation,
  part: {
    sender: AiConversation["messages"][number]["sender"];
    content: string;
  },
): AiConversation["messages"][number] {
  const now = new Date().toISOString();
  const msg: AiConversation["messages"][number] = {
    documentId: genId(),
    kind: "text",
    content: part.content,
    createdAt: now,
    editedAt: null,
    deletedAt: null,
    sender: part.sender,
    replyTo: null,
  };
  conv.messages.push(msg);
  conv.updatedAt = now;
  return msg;
}

async function saveConversation(conv: AiConversation): Promise<void> {
  await setJson(convKey(conv.viewerId, conv.aiUid), conv);
}

/** GET /api/agent/characters —— 可聊天的 AI 角色列表 */
export async function characters(): Promise<Response> {
  return ok(
    AI_ROLES.map((r) => ({
      slug: r.slug,
      displayName: r.displayName,
      bio: r.bio,
      avatar: r.avatar,
      sortOrder: 0,
      suggestedQuestions: r.suggestedQuestions ?? null,
      boundUser: {
        id: r.uid,
        login: r.slug,
        isAiAgent: true,
        authorDocumentId: null,
        name: r.displayName,
        avatar: r.avatar,
      },
    })),
  );
}

/** POST /api/dm/conversations/ai-session —— 取/建与某 AI 角色的会话 */
export async function aiSession(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetUserId } = await readJson<{ targetUserId?: number }>(req);
  const aiUid = Number(targetUserId);
  if (!Number.isFinite(aiUid)) return badRequest("缺少 targetUserId");
  const aiRole = aiRoleByUid(aiUid);
  if (!aiRole) return notFound("AI 角色不存在");
  const conv = await ensureConversation(viewer.userId, aiUid);
  return json({ data: toSummary(conv, aiRole), isNew: conv.messages.length === 0 });
}

/** GET /api/dm/conversations —— 当前用户的会话列表（仅 AI 会话） */
export async function conversations(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const prefix = `${AI_PREFIX}${viewer.userId}/`;
  const keys = await listKeys(prefix);
  const summaries: Doc[] = [];
  for (const key of keys) {
    const conv = await getJson<AiConversation>(key);
    if (!conv) continue;
    const aiRole = aiRoleByUid(Number(conv.aiUid));
    if (aiRole) summaries.push(toSummary(conv, aiRole));
  }
  summaries.sort((a, b) =>
    String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")),
  );
  return ok(summaries);
}

/** 取 URL 中倒数第 n 段（1 = 最后一段，2 = 倒数第二段），已去 query */
function urlSegment(req: Request, fromEnd: number): string {
  const segs = req.url.split("?")[0]!.split("/").filter(Boolean);
  return decodeURIComponent(segs[segs.length - fromEnd] || "");
}

/** GET /api/dm/conversations/:id/messages —— 消息列表（desc） */
export async function messages(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await findConversation(viewer.userId, id);
  if (!conv) return notFound("会话不存在");
  const list = conv.messages.map(toMessage).reverse();
  return ok(list, { hasMore: false, nextCursor: null });
}

/** POST /api/dm/conversations/:id/messages —— 发送消息并同步生成 AI 回复 */
export async function sendMessage(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const { content } = await readJson<{ content?: string; kind?: string }>(req);
  const text = String(content || "").trim();
  if (!text) return badRequest("消息不能为空");

  const conv = await findConversation(viewer.userId, id);
  if (!conv) return notFound("会话不存在");
  const aiRole = aiRoleByUid(Number(conv.aiUid));
  if (!aiRole) return notFound("AI 角色不存在");

  const viewerUser = await getJson<Doc>(`users/${viewer.userId}.json`);
  const viewerUid = Number((viewerUser as { uid?: unknown })?.uid || 0);

  const userMsg = pushMessage(conv, {
    sender: {
      userId: viewerUid,
      authorDocumentId: viewer.userId,
      name: String(viewerUser?.name || viewer.username || "我"),
      avatar: String(viewerUser?.avatar_url || DEFAULT_AVATAR),
      isAiAgent: false,
    },
    content: text,
  });

  // 同步生成 AI 回复
  const replyText = await generateReply(aiRole, conv.messages);
  const aiMsg = pushMessage(conv, {
    sender: {
      userId: aiRole.uid,
      authorDocumentId: null,
      name: aiRole.displayName,
      avatar: aiRole.avatar,
      isAiAgent: true,
    },
    content: replyText,
  });

  await saveConversation(conv);
  return json({ data: toMessage(userMsg), aiReply: toMessage(aiMsg) });
}

/** PATCH /api/dm/conversations/:id/read —— 标记已读（同步本地状态即可） */
export async function readConversation(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await findConversation(viewer.userId, id);
  if (!conv) return notFound("会话不存在");
  conv.updatedAt = new Date().toISOString();
  await saveConversation(conv);
  return json({ success: true, lastReadAt: conv.updatedAt });
}

/** POST /api/dm/conversations/:id/leave —— 删除会话 */
export async function leaveConversation(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await findConversation(viewer.userId, id);
  if (!conv) return notFound("会话不存在");
  await del(convKey(viewer.userId, Number(conv.aiUid)));
  return json({ success: true });
}

/** POST /api/dm/ai/regenerate —— 重新生成最后一条 AI 回复 */
export async function regenerate(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { messageId } = await readJson<{ messageId?: string }>(req);
  const mid = String(messageId || "");
  if (!mid) return badRequest("缺少 messageId");

  const convs = await loadAllConversations(viewer.userId);
  let conv: AiConversation | null = null;
  let idx = -1;
  for (const c of convs) {
    const i = c.messages.findIndex((m) => m.documentId === mid);
    if (i >= 0) {
      conv = c;
      idx = i;
      break;
    }
  }
  if (!conv || idx < 0) return notFound("消息不存在");

  // 找到触发它的用户消息：该 AI 回复之前的最近一条 user 消息
  let triggerContent = "";
  for (let i = idx - 1; i >= 0; i -= 1) {
    const m = conv.messages[i];
    if (m && !m.sender.isAiAgent) {
      triggerContent = m.content ?? "";
      break;
    }
  }

  const aiRole = aiRoleByUid(Number(conv.aiUid));
  if (!aiRole) return notFound("AI 角色不存在");

  // 软删旧回复
  conv.messages[idx]!.deletedAt = new Date().toISOString();
  conv.messages[idx]!.content = null;
  conv.updatedAt = new Date().toISOString();

  // 基于触发消息重新生成
  const historyBefore = conv.messages.slice(0, idx);
  const replyText = await generateReply(aiRole, [
    ...historyBefore,
    {
      documentId: genId(),
      kind: "text",
      content: triggerContent,
      createdAt: new Date().toISOString(),
      editedAt: null,
      deletedAt: null,
      sender: { userId: 0, authorDocumentId: null, name: "", avatar: "", isAiAgent: false },
      replyTo: null,
    },
  ]);
  const aiMsg = pushMessage(conv, {
    sender: {
      userId: aiRole.uid,
      authorDocumentId: null,
      name: aiRole.displayName,
      avatar: aiRole.avatar,
      isAiAgent: true,
    },
    content: replyText,
  });
  await saveConversation(conv);
  return json({ data: toMessage(aiMsg), removedId: mid });
}

/** POST /api/dm/ai/stop —— 无流式，空操作 */
export async function stop(): Promise<Response> {
  return json({ success: true });
}

/** POST /api/dm/read-all —— 无未读概念，空操作 */
export async function readAll(): Promise<Response> {
  return json({ success: true });
}

async function findConversation(viewerId: string, documentId: string): Promise<AiConversation | null> {
  if (!documentId.startsWith("ai-")) return null;
  const m = /^ai-([^-]+)-(\d+)$/.exec(documentId);
  if (!m || m[1] !== viewerId) return null;
  return loadConversation(viewerId, Number(m[2]));
}

async function loadAllConversations(viewerId: string): Promise<AiConversation[]> {
  const prefix = `${AI_PREFIX}${viewerId}/`;
  const keys = await listKeys(prefix);
  const convs: AiConversation[] = [];
  for (const key of keys) {
    const c = await getJson<AiConversation>(key);
    if (c) convs.push(c);
  }
  return convs;
}

// 导出工具（供 front-end 参考，不直接使用）
export const __aiRoles = AI_ROLES;
