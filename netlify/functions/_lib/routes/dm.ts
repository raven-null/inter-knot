/** 真实私信 / 群聊（敲敲「私聊」/「群聊」Tab）
 *
 * 存储（Netlify Blobs，`dm/` 前缀）：
 * - `dm/conv/{conversationId}.json`：会话文档（成员 + 消息 + 各成员偏好）
 * - `dm/conv-id/{uidA}/{uidB}.json`：direct 反查索引（uidA < uidB）
 *
 * 说明：
 * - 用户标识：AuthUser.userId = documentId（字符串）；sender.userId 用 8 位数值
 *   uid（与前端 selfUserId 对齐，决定 isMine）。
 * - Netlify 无 WebSocket：消息由 sendMessage 落库后随响应返回；对方打开弹窗 /
 *   进入会话时用 REST 拉到新消息（前端在会话切换/刷新时兜底）。
 */

import { genId, getJson, setJson, del, listKeys, userKey } from "../storage";
import { requireAuth } from "../auth";
import { json, ok, badRequest, notFound, readJson } from "../http";
import type { Doc } from "../serialize";
import { DEFAULT_AVATAR } from "../serialize";
import { listAiConversations, aiSummaryByDocumentId } from "./ai";

const CONV_PREFIX = "dm/conv/";
const CONV_ID_PREFIX = "dm/conv-id/";

type MemberRole = "owner" | "admin" | "member";

interface DmMember {
  /** 用户 documentId（JWT sub） */
  userId: string;
  /** 8 位数值 uid（前端 selfUserId 比对用） */
  uid: number;
  name: string;
  avatar: string;
  role: MemberRole;
}

interface DmMessageDoc {
  documentId: string;
  kind: "text" | "image" | "system";
  content: string | null;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  sender: { userId: number; authorDocumentId: string | null; name: string; avatar: string; isAiAgent: boolean };
  replyTo: { documentId: string; content: string | null; senderUserId: number | null } | null;
}

interface DmConversationDoc {
  documentId: string;
  kind: "direct" | "group";
  title: string | null;
  avatar: string | null;
  members: DmMember[];
  messages: DmMessageDoc[];
  createdAt: string;
  updatedAt: string;
  /** 各成员已读水位（userId → ISO） */
  lastReadAt: Record<string, string>;
  /** 各成员偏好（userId → { muted, pinned }） */
  prefs: Record<string, { muted: boolean; pinned: boolean }>;
}

const convKey = (id: string) => `${CONV_PREFIX}${id}.json`;

const pairKey = (a: number, b: number) => {
  const [x, y] = a < b ? [a, b] : [b, a];
  return `${CONV_ID_PREFIX}${x}/${y}.json`;
};

async function loadConv(id: string): Promise<DmConversationDoc | null> {
  return getJson<DmConversationDoc>(convKey(id));
}

async function saveConv(conv: DmConversationDoc): Promise<void> {
  await setJson(convKey(conv.documentId), conv);
}

/** 用户文档 → 前端 sender / member 结构（uid 从用户文档读） */
async function toMember(userId: string, role: MemberRole = "member"): Promise<DmMember | null> {
  const u = await getJson<Doc>(userKey(userId));
  if (!u) return null;
  return {
    userId,
    uid: Number((u as { uid?: unknown }).uid || 0),
    name: String(u.name || u.username || ""),
    avatar: String(u.avatar_url || DEFAULT_AVATAR),
    role,
  };
}

/** 通过 uid 反查用户 documentId */
async function docIdByUid(uid: number): Promise<string | null> {
  const idx = await getJson<{ document_id?: string }>(`users/by-uid/${uid}.json`);
  return idx?.document_id ? String(idx.document_id) : null;
}

const toMessage = (m: DmMessageDoc): Doc => ({ ...m });

/** 会话摘要（前端 DmConversationSummary） */
function toSummary(conv: DmConversationDoc, selfUserId: string): Doc {
  const last = conv.messages[conv.messages.length - 1];
  const self = conv.members.find((m) => m.userId === selfUserId);
  const peer = conv.kind === "direct" ? conv.members.find((m) => m.userId !== selfUserId) : null;
  const lastReadAt = conv.lastReadAt[selfUserId] || "";
  const unread = lastReadAt
    ? conv.messages.filter((m) => {
        if (m.sender.userId === self?.uid) return false;
        return !m.deletedAt && m.createdAt > lastReadAt;
      }).length
    : conv.messages.filter((m) => m.sender.userId !== self?.uid && !m.deletedAt).length;
  const prefs = conv.prefs[selfUserId] || { muted: false, pinned: false };
  return {
    documentId: conv.documentId,
    kind: conv.kind,
    title: conv.kind === "group" ? conv.title : peer?.name ?? null,
    avatar: conv.avatar,
    peer: peer ? { userId: peer.uid, authorDocumentId: peer.userId, name: peer.name, avatar: peer.avatar } : null,
    memberCount: conv.members.length,
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
    unreadCount: unread,
    self: {
      role: self?.role ?? "member",
      muted: prefs.muted,
      pinned: prefs.pinned,
      lastReadAt: lastReadAt || null,
    },
    pseudoKind: null,
  };
}

async function findDirectConv(selfUid: number, peerUid: number): Promise<DmConversationDoc | null> {
  const idx = await getJson<{ conversationId?: string }>(pairKey(selfUid, peerUid));
  if (!idx?.conversationId) return null;
  return loadConv(idx.conversationId);
}

/** 获取/新建私聊会话（两个用户对一） */
export async function direct(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const { targetUserId } = await readJson<{ targetUserId?: number }>(req);
  const peerUid = Number(targetUserId);
  if (!Number.isFinite(peerUid) || peerUid <= 0) return badRequest("缺少 targetUserId");
  const self = await toMember(viewer.userId, "owner");
  if (!self) return badRequest("用户数据异常");
  const peerDocId = await docIdByUid(peerUid);
  if (!peerDocId || peerDocId === viewer.userId) return badRequest("无法私信该用户");
  const peer = await toMember(peerDocId, "member");
  if (!peer) return badRequest("对方用户不存在");

  const existing = await findDirectConv(self.uid, peerUid);
  if (existing) {
    // 若双方 uid 变化导致索引缺失，补建索引
    return json({ data: toSummary(existing, viewer.userId), isNew: false });
  }

  const now = new Date().toISOString();
  const conversationId = genId();
  const conv: DmConversationDoc = {
    documentId: conversationId,
    kind: "direct",
    title: null,
    avatar: null,
    members: [self, peer],
    messages: [],
    createdAt: now,
    updatedAt: now,
    lastReadAt: { [self.userId]: now, [peer.userId]: now },
    prefs: {},
  };
  await saveConv(conv);
  await setJson(pairKey(self.uid, peerUid), { conversationId });
  return json({ data: toSummary(conv, viewer.userId), isNew: true });
}

/** 创建群聊（body: { title?, memberIds?: number[] }） */
export async function createGroup(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const body = await readJson<{ title?: string; memberIds?: number[] }>(req);
  const owner = await toMember(viewer.userId, "owner");
  if (!owner) return badRequest("用户数据异常");

  const now = new Date().toISOString();
  const conversationId = genId();
  const members: DmMember[] = [owner];
  if (Array.isArray(body.memberIds)) {
    for (const uid of body.memberIds) {
      const id = await docIdByUid(Number(uid));
      if (!id || id === viewer.userId || members.some((m) => m.userId === id)) continue;
      const m = await toMember(id, "member");
      if (m) members.push(m);
    }
  }
  const conv: DmConversationDoc = {
    documentId: conversationId,
    kind: "group",
    title: String(body.title || "").trim().slice(0, 60) || `${owner.name}的群`,
    avatar: null,
    members,
    messages: [],
    createdAt: now,
    updatedAt: now,
    lastReadAt: Object.fromEntries(members.map((m) => [m.userId, now])),
    prefs: {},
  };
  await saveConv(conv);
  return json({ data: toSummary(conv, viewer.userId) });
}

/** 取 URL 中倒数第 n 段（1 = 最后一段，2 = 倒数第二段），已去 query */
function urlSegment(req: Request, fromEnd: number): string {
  const segs = req.url.split("?")[0]!.split("/").filter(Boolean);
  return decodeURIComponent(segs[segs.length - fromEnd] || "");
}

/** 群聊邀请成员（body: { memberIds: number[] }） */
export async function addGroupMembers(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await loadConv(id);
  if (!conv) return notFound("会话不存在");
  if (conv.kind !== "group") return badRequest("仅群聊可邀请");
  if (!conv.members.some((m) => m.userId === viewer.userId)) return badRequest("不在群内");

  const { memberIds } = await readJson<{ memberIds?: number[] }>(req);
  if (!Array.isArray(memberIds) || memberIds.length === 0) return badRequest("缺少 memberIds");
  for (const uid of memberIds) {
    const did = await docIdByUid(Number(uid));
    if (!did || did === viewer.userId || conv.members.some((m) => m.userId === did)) continue;
    const m = await toMember(did, "member");
    if (m) {
      conv.members.push(m);
      conv.lastReadAt[did] = new Date().toISOString();
    }
  }
  conv.updatedAt = new Date().toISOString();
  await saveConv(conv);
  return json({ success: true, memberCount: conv.members.length });
}

/** GET /api/dm/conversations —— 会话列表（direct + group + AI） */
export async function conversations(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const summaries: Doc[] = [];
  const keys = await listKeys(CONV_PREFIX);
  for (const key of keys) {
    const conv = await getJson<DmConversationDoc>(key);
    if (!conv) continue;
    if (!conv.members.some((m) => m.userId === viewer.userId)) continue;
    summaries.push(toSummary(conv, viewer.userId));
  }
  // 混入 AI 会话（敲敲「通话」Tab 共用同一列表数据源）
  const aiList = await listAiConversations(viewer.userId);
  summaries.push(...aiList);
  summaries.sort((a, b) => String(b.lastMessageAt || "").localeCompare(String(a.lastMessageAt || "")));
  return ok(summaries);
}

async function resolveConvForMember(id: string, userId: string): Promise<DmConversationDoc | null> {
  const conv = await loadConv(id);
  if (!conv) return null;
  if (!conv.members.some((m) => m.userId === userId)) return null;
  return conv;
}

/** GET /api/dm/conversations/:id/messages —— 消息列表（desc） */
export async function messages(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await resolveConvForMember(id, viewer.userId);
  if (!conv) return notFound("会话不存在");
  const list = conv.messages.map(toMessage).reverse();
  return ok(list, { hasMore: false, nextCursor: null });
}

/** POST /api/dm/conversations/:id/messages —— 发送消息 */
export async function sendMessage(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const { content, kind, replyTo } = await readJson<{ content?: string; kind?: string; replyTo?: string }>(req);
  const text = String(content || "").trim();
  if (!text) return badRequest("消息不能为空");

  const conv = await resolveConvForMember(id, viewer.userId);
  if (!conv) return notFound("会话不存在");
  const self = conv.members.find((m) => m.userId === viewer.userId);
  if (!self) return notFound("会话不存在");

  let replyRef: DmMessageDoc["replyTo"] = null;
  if (replyTo) {
    const target = conv.messages.find((m) => m.documentId === replyTo);
    if (target) {
      replyRef = {
        documentId: target.documentId,
        content: target.content,
        senderUserId: target.sender.userId,
      };
    }
  }

  const now = new Date().toISOString();
  const msg: DmMessageDoc = {
    documentId: genId(),
    kind: kind === "image" ? "image" : "text",
    content: text,
    createdAt: now,
    editedAt: null,
    deletedAt: null,
    sender: {
      userId: self.uid,
      authorDocumentId: self.userId,
      name: self.name,
      avatar: self.avatar,
      isAiAgent: false,
    },
    replyTo: replyRef,
  };
  conv.messages.push(msg);
  conv.updatedAt = now;
  await saveConv(conv);
  return json({ data: toMessage(msg) });
}

/** PATCH /api/dm/conversations/:id/read —— 标记已读 */
export async function readConversation(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await resolveConvForMember(id, viewer.userId);
  if (!conv) return notFound("会话不存在");
  conv.lastReadAt[viewer.userId] = new Date().toISOString();
  await saveConv(conv);
  return json({ success: true, lastReadAt: conv.lastReadAt[viewer.userId] });
}

/** PATCH /api/dm/conversations/:id —— 更新偏好（muted/pinned/title） */
export async function updateConversation(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const { muted, pinned, title } = await readJson<{ muted?: boolean; pinned?: boolean; title?: string }>(req);
  const conv = await resolveConvForMember(id, viewer.userId);
  if (!conv) return notFound("会话不存在");
  const prefs = conv.prefs[viewer.userId] || { muted: false, pinned: false };
  if (typeof muted === "boolean") prefs.muted = muted;
  if (typeof pinned === "boolean") prefs.pinned = pinned;
  conv.prefs[viewer.userId] = prefs;
  if (conv.kind === "group" && typeof title === "string") {
    const self = conv.members.find((m) => m.userId === viewer.userId);
    if (self?.role === "owner") conv.title = title.trim().slice(0, 60) || conv.title;
  }
  conv.updatedAt = new Date().toISOString();
  await saveConv(conv);
  return json({ success: true });
}

/** POST /api/dm/conversations/:id/leave —— 离开/删除会话 */
export async function leaveConversation(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const id = urlSegment(req, 2);
  const conv = await resolveConvForMember(id, viewer.userId);
  if (!conv) return notFound("会话不存在");
  // 群聊：移除自己；私聊：删除整会话 + 反查索引
  if (conv.kind === "group") {
    conv.members = conv.members.filter((m) => m.userId !== viewer.userId);
    conv.updatedAt = new Date().toISOString();
    if (conv.members.length === 0) {
      await del(convKey(id));
    } else {
      await saveConv(conv);
    }
  } else {
    await del(convKey(id));
    const self = conv.members.find((m) => m.userId === viewer.userId);
    const peer = conv.members.find((m) => m.userId !== viewer.userId);
    if (self && peer) await del(pairKey(self.uid, peer.uid));
  }
  return json({ success: true });
}

/** PATCH /api/dm/messages/:id —— 编辑消息 */
export async function editMessage(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const messageId = req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "";
  const { content } = await readJson<{ content?: string }>(req);
  const text = String(content || "").trim();
  if (!text) return badRequest("内容不能为空");

  const found = await findMessage(messageId, viewer.userId);
  if (!found) return notFound("消息不存在");
  found.msg.content = text;
  found.msg.editedAt = new Date().toISOString();
  await saveConv(found.conv);
  return json({ success: true });
}

/** DELETE /api/dm/messages/:id —— 撤回消息 */
export async function withdrawMessage(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const messageId = req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "";
  const found = await findMessage(messageId, viewer.userId);
  if (!found) return notFound("消息不存在");
  found.msg.deletedAt = new Date().toISOString();
  found.msg.content = null;
  await saveConv(found.conv);
  return json({ success: true });
}

/** POST /api/dm/read-all —— 全部已读 */
export async function readAll(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const now = new Date().toISOString();
  const keys = await listKeys(CONV_PREFIX);
  for (const key of keys) {
    const conv = await getJson<DmConversationDoc>(key);
    if (!conv || !conv.members.some((m) => m.userId === viewer.userId)) continue;
    conv.lastReadAt[viewer.userId] = now;
    await saveConv(conv);
  }
  return json({ success: true });
}

/** POST /api/dm/conversations/:id/reset-context —— 无 AI 上下文概念，空操作 */
export async function resetContext(): Promise<Response> {
  return json({ success: true });
}

async function findMessage(
  messageId: string,
  userId: string,
): Promise<{ conv: DmConversationDoc; msg: DmMessageDoc } | null> {
  const keys = await listKeys(CONV_PREFIX);
  for (const key of keys) {
    const conv = await getJson<DmConversationDoc>(key);
    if (!conv || !conv.members.some((m) => m.userId === userId)) continue;
    const msg = conv.messages.find((m) => m.documentId === messageId);
    if (msg) return { conv, msg };
  }
  return null;
}

// 供前端渲染 / 调试的成员列表（可选，未接入路由时无需）
export { aiSummaryByDocumentId };
