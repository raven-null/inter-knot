/** 评论相关路由（基于 Netlify Blobs） */

import { genId, getJson, setJson, del, listKeys, commentKey, postKey, KEYS } from "../storage";
import { feedUpdate, getUser, updateUserStats } from "../feed";
import { resolveUser, requireAuth } from "../auth";
import { ok, json, badRequest, notFound, int, bool, readJson, queryParams } from "../http";
import { toComment, hydrateAuthorLevels, type Doc } from "../serialize";
import { awardExp } from "../exp";
import { generateGlm, FAIRY_COMMENT_PROMPT, FAIRY_DOC_ID, FAIRY_NAME, FAIRY_AVATAR } from "../glm";

/** 提取正文里的 mention documentId 列表 */
function mentionedDocIds(content: string): string[] {
  const ids: string[] = [];
  const re = /@\[([^\[\]\n]{1,40})\]\(([A-Za-z0-9]{6,32})\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m[2]) ids.push(m[2]);
  }
  return ids;
}

async function getPostDoc(id: string): Promise<Doc | null> {
  return getJson<Doc>(postKey(id));
}

// ── 用户评论索引（个人主页「TA 的评论」） ──────────────
async function userCommentKeys(userId: string): Promise<string[]> {
  return (await getJson<string[]>(KEYS.userComments(userId))) ?? [];
}
async function addUserComment(userId: string, key: string): Promise<void> {
  const keys = await userCommentKeys(userId);
  if (!keys.includes(key)) {
    keys.unshift(key);
    await setJson(KEYS.userComments(userId), keys);
  }
}
async function removeUserComment(userId: string, key: string): Promise<void> {
  await setJson(KEYS.userComments(userId), (await userCommentKeys(userId)).filter((k) => k !== key));
}

async function buildCommentTree(postId: string, viewerId: string | null): Promise<Doc[]> {
  const keys = await listKeys(`comments/${postId}/`);
  const docs: Doc[] = [];
  for (const key of keys) {
    const d = await getJson<Doc>(key);
    if (d) docs.push(d);
  }
  docs.sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));

  const likedIds = new Set<string>();
  if (viewerId) {
    const likeKeys = await listKeys(`likes/${viewerId}/comment/`);
    const pageIds = new Set(docs.map((d) => String(d.document_id)));
    for (const k of likeKeys) {
      const cid = k.split("/")[3];
      if (pageIds.has(cid)) likedIds.add(cid);
    }
  }

  // 用实时作者等级覆盖快照，保证评论区等级与用户当前等级一致
  const hydrated = await hydrateAuthorLevels(docs);

  const byId = new Map<string, Doc>();
  const result: Doc[] = [];
  for (const d of hydrated) {
    const id = String(d.document_id);
    if (!d.parent_id) {
      const node = toComment(d, likedIds);
      if (node) {
        node.replies = [];
        byId.set(id, node);
        result.push(node);
      }
    }
  }
  for (const d of hydrated) {
    const id = String(d.document_id);
    if (d.parent_id) {
      const parent = byId.get(String(d.parent_id));
      const node = toComment(d, likedIds);
      if (parent && node) (parent.replies as unknown[]).push(node);
    }
  }
  return result;
}

export async function list(req: Request): Promise<Response> {
  const qp = queryParams(req);
  const articleId = qp.get("article") || "";
  const start = Math.max(0, int(qp.get("start")));
  const limit = Math.min(50, Math.max(1, int(qp.get("limit"), 20)));
  const viewer = await resolveUser(req);

  if (!articleId) return ok([]);
  const post = await getPostDoc(articleId);
  if (!post) return ok([]);

  const all = await buildCommentTree(articleId, viewer ? viewer.userId : null);
  all.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return 0;
  });
  const pinned = all.find((c) => c.isPinned === true) || null;
  const pageNodes = all.slice(start, start + limit);
  const meta = {
    pagination: { start, limit, total: all.length, pageCount: Math.ceil(all.length / limit) },
  };
  return json({ data: pageNodes, meta, pinned });
}

export async function create(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const body = await readJson<{ data?: Doc }>(req);
  const data = body.data || {};
  const postId = String(data.article || "");
  const content = String(data.content || "").trim();
  const parentId = data.parent ? String(data.parent) : undefined;
  // 前端上传后传的是上传文件 documentId，需解析为实际 URL
  const rawImages = Array.isArray(data.images)
    ? data.images.filter((u): u is string => typeof u === "string" && u.length > 0)
    : [];
  const images: string[] = [];
  for (const id of rawImages) {
    if (id.startsWith("/") || id.startsWith("http")) {
      images.push(id);
      continue;
    }
    const meta = await getJson<{ url?: string }>(`uploads/by-document/${id}.json`);
    if (meta?.url) images.push(String(meta.url));
  }

  if (!postId) return badRequest("缺少帖子 ID");
  if (!content && images.length === 0) return badRequest("评论内容不能为空");

  const post = await getPostDoc(postId);
  if (!post) return notFound("帖子不存在");

  if (parentId) {
    const parent = await getJson<Doc>(KEYS.commentLookup(parentId));
    if (!parent) return notFound("回复的评论不存在");
  }

  const commentId = genId();
  const now = new Date().toISOString();
  const keys = await listKeys(`comments/${postId}/`);
  const author = await getUser(viewer.userId);

  const doc: Doc = {
    id: commentId,
    document_id: commentId,
    post_id: postId,
    author_id: viewer.userId,
    parent_id: parentId || null,
    content,
    images,
    is_anonymous: bool(data.isAnonymous),
    is_pinned: false,
    likes_count: 0,
    floor: keys.length + 1,
    created_at: now,
    author_document_id: viewer.userId,
    author_username: author?.username || "",
    author_name: author?.name || author?.username || "",
    author_avatar_url: author?.avatar_url || "/images/default-avatar.webp",
    author_level: author?.level ?? 1,
    author_exp: author?.exp ?? 0,
  };

  const key = commentKey(postId, commentId);
  await setJson(key, doc);
  await setJson(KEYS.commentLookup(commentId), { post_id: postId, key });
  await addUserComment(viewer.userId, key);
  await feedUpdate(postId, { comments_count: Number(post.comments_count || 0) + 1 });
  await updateUserStats(String(post.author_document_id), { totalComments: 1 });
  await updateUserStats(viewer.userId, { commentCount: 1 });
  // 等级体系：发表评论 +3 绳网信用
  await awardExp(viewer.userId, 3);

  const node = toComment(doc, new Set());
  node!.replies = [];

  // ── 评论区 @fairy：生成 Fairy 楼中楼回复 ──────────────
  let fairyReply: Doc | null = null;
  if (mentionedDocIds(content).includes(FAIRY_DOC_ID)) {
    const title = String(post.title || "无标题");
    const text = String(post.text || post.body || "").slice(0, 800);
    const replyText = await generateGlm([
      { role: "system", content: FAIRY_COMMENT_PROMPT },
      {
        role: "user",
        content: [
          `帖子标题：${title}`,
          text ? `帖子内容：${text}` : "",
          `评论者 ${author?.name || viewer.username || "用户"} 在评论区 @了你：`,
          content,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ]);
    const fairyCommentId = genId();
    const fNow = new Date().toISOString();
    const fairyDoc: Doc = {
      id: fairyCommentId,
      document_id: fairyCommentId,
      post_id: postId,
      author_id: FAIRY_DOC_ID,
      parent_id: commentId,
      content: replyText,
      images: [],
      is_anonymous: false,
      is_pinned: false,
      likes_count: 0,
      floor: keys.length + 2,
      created_at: fNow,
      author_document_id: FAIRY_DOC_ID,
      author_username: "fairy",
      author_name: FAIRY_NAME,
      author_avatar_url: FAIRY_AVATAR,
      author_level: 7,
      author_exp: 0,
    };
    const fKey = commentKey(postId, fairyCommentId);
    await setJson(fKey, fairyDoc);
    await setJson(KEYS.commentLookup(fairyCommentId), { post_id: postId, key: fKey });
    await feedUpdate(postId, { comments_count: Number(post.comments_count || 0) + 1 });
    fairyReply = toComment(fairyDoc, new Set());
  }

  return json({
    data: node,
    ...(fairyReply ? { fairyReply } : {}),
  });
}

async function findComment(commentId: string): Promise<{ doc: Doc; key: string; postId: string } | null> {
  const lookup = await getJson<{ post_id: string; key: string }>(KEYS.commentLookup(commentId));
  if (!lookup) return null;
  const doc = await getJson<Doc>(lookup.key);
  if (!doc) return null;
  return { doc, key: lookup.key, postId: lookup.post_id };
}

export async function remove(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const commentId = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const found = await findComment(commentId);
  if (!found) return notFound("评论不存在");
  if (String(found.doc.author_document_id) !== viewer.userId && viewer.role !== "admin") {
    return badRequest("无权删除");
  }
  await del(found.key);
  await del(KEYS.commentLookup(commentId));
  await removeUserComment(String(found.doc.author_document_id), found.key);
  const post = await getPostDoc(found.postId);
  if (post) await feedUpdate(found.postId, { comments_count: Math.max(0, Number(post.comments_count || 0) - 1) });
  await updateUserStats(String(found.doc.author_document_id), { commentCount: -1 });
  await updateUserStats(String(post?.author_document_id), { totalComments: -1 });
  return json({ success: true });
}

export async function pin(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const commentId = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const found = await findComment(commentId);
  if (!found) return notFound("评论不存在");
  if (viewer.role !== "admin" && viewer.role !== "moderator") return badRequest("无权置顶");
  await setJson(found.key, { ...found.doc, is_pinned: true });
  return json({ success: true });
}

export async function unpin(req: Request): Promise<Response> {
  const viewer = await requireAuth(req);
  const commentId = decodeURIComponent(req.url.split("?")[0]!.split("/").filter(Boolean).pop() || "");
  const found = await findComment(commentId);
  if (!found) return notFound("评论不存在");
  if (viewer.role !== "admin" && viewer.role !== "moderator") return badRequest("无权取消置顶");
  await setJson(found.key, { ...found.doc, is_pinned: false });
  return json({ success: true });
}
