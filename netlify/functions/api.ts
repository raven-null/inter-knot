/**
 * 论坛后端 API 入口（Netlify Functions v2）
 *
 * - 单入口 catch-all 路由到 /api/*
 * - getStore()（Netlify Blobs）在 handler 内部调用
 */

import type { Config } from "@netlify/functions";
import { ensureSeed } from "./_lib/seed";
import { json, error } from "./_lib/http";
import { isApiThrow } from "./_lib/auth";

import * as authRoutes from "./_lib/routes/auth";
import * as articleRoutes from "./_lib/routes/articles";
import * as commentRoutes from "./_lib/routes/comments";
import * as interactionRoutes from "./_lib/routes/interactions";
import * as uploadRoutes from "./_lib/routes/uploads";
import * as profileRoutes from "./_lib/routes/profiles";
import * as meRoutes from "./_lib/routes/me";
import * as adminRoutes from "./_lib/routes/admin";
import * as emoteRoutes from "./_lib/routes/emotes";
import * as mihoyoRoutes from "./_lib/routes/mihoyo";
import * as aiRoutes from "./_lib/routes/ai";
import * as dmRoutes from "./_lib/routes/dm";
import * as notificationRoutes from "./_lib/routes/notifications";
import * as stubRoutes from "./_lib/routes/stubs";

export default async function handler(req: Request): Promise<Response> {
  try {
    await ensureSeed();
  } catch (err) {
    console.error("seed failed:", err);
  }
  try {
    return await dispatch(req);
  } catch (err) {
    if (isApiThrow(err)) return error(err.status, err.message, err.code);
    console.error("API error:", err);
    return error(500, "服务器异常", "INTERNAL");
  }
}

export const config: Config = {
  path: "/api/*",
};

function segments(req: Request): string[] {
  return new URL(req.url).pathname.split("/").filter(Boolean);
}

function method(req: Request): string {
  return req.method.toUpperCase();
}

function isGet(req: Request): boolean {
  return method(req) === "GET";
}
function isPost(req: Request): boolean {
  return method(req) === "POST";
}
function isPut(req: Request): boolean {
  return method(req) === "PUT";
}
function isPatch(req: Request): boolean {
  return method(req) === "PATCH";
}
function isDelete(req: Request): boolean {
  return method(req) === "DELETE";
}

async function dispatch(req: Request): Promise<Response> {
  const s = segments(req);
  const area = s[1] || "";
  const sub = s[2] || "";
  const sub2 = s[3] || "";

  switch (area) {
    // ── 认证 ─────────────────────────────────────────
    case "auth": {
      if (sub === "login-by-key" && isPost(req)) return authRoutes.loginByKey(req);
      if (sub === "renew" && isPost(req)) return authRoutes.renew(req);
      if (sub === "mihoyo" && sub2 === "qr" && s.length === 4 && isPost(req)) return mihoyoRoutes.qrCreate(req);
      if (sub === "mihoyo" && sub2 === "qr" && s[4] === "status" && isPost(req)) return mihoyoRoutes.qrStatus(req);
      if (sub === "mihoyo" && sub2 === "binding" && isGet(req)) return mihoyoRoutes.binding(req);
      if (sub === "mihoyo" && sub2 === "binding" && isDelete(req)) return mihoyoRoutes.unbind(req);
      return error(404, "接口不存在");
    }

    // ── 帖子 / 帖子 ─────────────────────────────────
    case "articles": {
      if (sub === "list" && isGet(req)) return articleRoutes.list(req);
      if (sub === "search" && isGet(req)) return articleRoutes.list(req);
      if (sub === "suggest" && isGet(req)) return articleRoutes.suggest(req);
      if (sub === "triple" && isPost(req)) return articleRoutes.triple(req);
      if (sub === "bilibili-info" && isGet(req)) return articleRoutes.bilibiliInfo(req);
      if (sub === "deleted-since" && isGet(req)) return articleRoutes.deletedSince(req);
      if (sub === "my" && sub2 === "drafts" && isGet(req)) return articleRoutes.myDrafts(req);
      if (sub === "my" && sub2 === "detail" && isGet(req)) return articleRoutes.myDraftDetail(req);
      if (sub === "detail" && isGet(req)) return articleRoutes.detail(req);
      if (s.length >= 4 && sub2 === "view" && isPost(req)) return articleRoutes.view(req);
      if (s.length >= 4 && sub2 === "publish" && isPost(req)) return articleRoutes.publishDraft(req);
      if (s.length >= 4 && sub2 === "discard-draft" && isPost(req)) return articleRoutes.discardDraft(req);
      if (s.length === 2 && isPost(req)) return articleRoutes.createDraft(req);
      if (s.length === 3 && isPut(req)) return articleRoutes.updateDraft(req);
      if (s.length === 3 && isDelete(req)) return articleRoutes.remove(req);
      return error(404, "接口不存在");
    }

    // ── 评论 ─────────────────────────────────────────
    case "comments": {
      if (sub === "list" && isGet(req)) return commentRoutes.list(req);
      if (s.length === 2 && isPost(req)) return commentRoutes.create(req);
      if (s.length === 3 && isDelete(req)) return commentRoutes.remove(req);
      if (sub2 === "pin" && isPost(req)) return commentRoutes.pin(req);
      if (sub2 === "unpin" && isPost(req)) return commentRoutes.unpin(req);
      return error(404, "接口不存在");
    }

    // ── 版块 ─────────────────────────────────────────
    case "categories": {
      if (sub === "list" && isGet(req)) {
        const { listKeys, getJson, categoryKey } = await import("./_lib/storage");
        const { toCategory } = await import("./_lib/serialize");
        const keys = (await listKeys("categories/")).filter((k) => !k.includes("/_lookup/"));
        const rows: unknown[] = [];
        for (const key of keys) {
          const c = await getJson<Record<string, unknown>>(key);
          if (c && c.is_hidden !== true) rows.push(toCategory(c));
        }
        rows.sort((a, b) => Number((a as { order?: number }).order || 0) - Number((b as { order?: number }).order || 0));
        return json({ data: rows });
      }
      return error(404, "接口不存在");
    }

    // ── 互动 ─────────────────────────────────────────
    case "likes": {
      if (sub === "toggle" && isPost(req)) return interactionRoutes.toggleLike(req);
      if (sub === "check" && isGet(req)) return interactionRoutes.checkLikes(req);
      return error(404, "接口不存在");
    }
    case "favorites": {
      if (sub === "toggle" && isPost(req)) return interactionRoutes.toggleFavorite(req);
      if (sub === "check" && isGet(req)) return interactionRoutes.checkFavorites(req);
      return error(404, "接口不存在");
    }
    case "follows": {
      if (sub === "toggle" && isPost(req)) return interactionRoutes.toggleFollow(req);
      if (sub === "check" && isGet(req)) return interactionRoutes.checkFollows(req);
      if (s.length >= 2 && isGet(req)) return interactionRoutes.listFollows(req);
      return error(404, "接口不存在");
    }
    case "user-blocks": {
      if (sub === "toggle" && isPost(req)) return interactionRoutes.toggleUserBlock(req);
      if (sub === "check" && isGet(req)) return interactionRoutes.checkUserBlocks(req);
      if (sub === "my-list" && isGet(req)) return interactionRoutes.myBlockedList(req);
      return error(404, "接口不存在");
    }
    case "reports": {
      if (s.length === 2 && isPost(req)) return interactionRoutes.createReport(req);
      if (sub === "check" && isGet(req)) return interactionRoutes.checkReports(req);
      return error(404, "接口不存在");
    }
    case "authors": {
      if (sub === "search" && isGet(req)) return interactionRoutes.searchAuthors(req);
      return error(404, "接口不存在");
    }
    case "article-reads": {
      if (sub === "batch" && isPost(req)) return articleRoutes.markReadBatch(req);
      return error(404, "接口不存在");
    }

    // ── 个人主页 ─────────────────────────────────────
    case "profiles": {
      if (sub2 === "articles" && isGet(req)) return profileRoutes.articles(req);
      if (sub2 === "comments" && isGet(req)) return profileRoutes.comments(req);
      if (sub2 === "favorites" && isGet(req)) return profileRoutes.favorites(req);
      if (sub2 === "history" && isGet(req)) return profileRoutes.history(req);
      if (s.length === 3 && isGet(req)) return profileRoutes.detail(req);
      return error(404, "接口不存在");
    }

    // ── 我的 ─────────────────────────────────────────
    case "me": {
      if (sub === "profile" && s.length === 3 && isGet(req)) return authRoutes.meProfile(req);
      if (sub === "profile" && sub2 === "name" && isPut(req)) return meRoutes.updateName(req);
      if (sub === "profile" && sub2 === "bio" && isPut(req)) return meRoutes.updateBio(req);
      if (sub === "profile" && sub2 === "visibility" && isPut(req)) return meRoutes.updateVisibility(req);
      if (sub === "profile" && sub2 === "video-muted" && isPut(req)) return meRoutes.updateVideoMuted(req);
      if (sub === "profile" && sub2 === "pinned-articles" && isGet(req)) return meRoutes.pinnedArticles(req);
      if (sub === "profile" && sub2 === "pinned-articles" && isPut(req)) return meRoutes.updatePinnedArticles(req);
      if (sub === "security" && isGet(req)) return meRoutes.security(req);
      if (sub === "uploads" && s.length === 3 && isGet(req)) return meRoutes.uploads(req);
      if (sub === "uploads" && s.length === 4 && isDelete(req)) return meRoutes.deleteUpload(req);
      if (sub === "business-cards" && sub2 === "equip" && isPut(req)) return meRoutes.equipBusinessCard(req);
      if (sub === "business-cards" && sub2 === "upload-custom" && isPut(req)) return meRoutes.uploadCustomCard(req);
      if (sub === "business-cards" && isGet(req)) return meRoutes.businessCards(req);
      if (sub === "business-cards" && s.length === 4 && isDelete(req)) return meRoutes.deleteCustomCard(req);
      if (sub === "avatars" && sub2 === "equip" && isPut(req)) return meRoutes.equipAvatar();
      if (sub === "avatars" && sub2 === "upload-custom" && isPut(req)) return meRoutes.uploadCustomAvatar(req);
      if (sub === "avatars" && s.length === 3 && isGet(req)) return meRoutes.avatars();
      return error(404, "接口不存在");
    }

    // ── 上传 ─────────────────────────────────────────
    case "direct-upload": {
      if (sub === "sign" && isPost(req)) return uploadRoutes.sign(req);
      if (sub === "complete" && isPost(req)) return uploadRoutes.complete(req);
      if (sub === "raw" && s.length === 4 && isPut(req)) return uploadRoutes.rawUpload(req);
      return error(404, "接口不存在");
    }
    case "uploads": {
      if (s.length === 3 && isGet(req)) return uploadRoutes.serve(req);
      return error(404, "接口不存在");
    }

    // ── 公开站点设置 ──────────────────────────────
    case "settings": {
      if (sub === "public" && isGet(req)) return adminRoutes.publicSettings();
      return error(404, "接口不存在");
    }

    // ── 后台管理 ─────────────────────────────────────
    case "admin": {
      if (sub === "stats" && isGet(req)) return adminRoutes.stats(req);
      if (sub === "users" && s.length === 3 && isGet(req)) return adminRoutes.users(req);
      if (sub === "users" && s.length === 4 && isPatch(req)) return adminRoutes.updateUser(req);
      if (sub === "users" && s.length === 4 && isDelete(req)) return adminRoutes.deleteUser(req);
      if (sub === "posts" && s.length === 3 && isGet(req)) return adminRoutes.posts(req);
      if (sub === "posts" && s.length === 4 && isPatch(req)) return adminRoutes.updatePost(req);
      if (sub === "comments" && s.length === 3 && isGet(req)) return adminRoutes.comments(req);
      if (sub === "comments" && s.length === 4 && isDelete(req)) return adminRoutes.deleteComment(req);
      if (sub === "categories" && s.length === 3 && isGet(req)) return adminRoutes.categories(req);
      if (sub === "categories" && s.length === 3 && isPost(req)) return adminRoutes.createCategory(req);
      if (sub === "categories" && s.length === 4 && isPut(req)) return adminRoutes.updateCategory(req);
      if (sub === "categories" && s.length === 4 && isDelete(req)) return adminRoutes.deleteCategory(req);
      if (sub === "reports" && s.length === 3 && isGet(req)) return adminRoutes.reports(req);
      if (sub === "reports" && s.length === 4 && isPost(req)) return adminRoutes.processReport(req);
      if (sub === "emotes" && s.length === 3 && isGet(req)) return emoteRoutes.adminList(req);
      if (sub === "emotes" && s.length === 3 && isPost(req)) return emoteRoutes.createEmote(req);
      if (sub === "emotes" && s.length === 4 && isDelete(req)) return emoteRoutes.deleteEmote(req);
      if (sub === "emotes" && sub2 === "groups" && s.length === 4 && isPost(req)) return emoteRoutes.addGroup(req);
      if (sub === "emotes" && sub2 === "groups" && s.length === 5 && isDelete(req)) return emoteRoutes.deleteGroup(req);
      if (sub === "settings" && isGet(req)) return adminRoutes.settings(req);
      if (sub === "settings" && isPut(req)) return adminRoutes.updateSettings(req);
      return error(404, "接口不存在");
    }

    // ── 外围功能（桩） ───────────────────────────────
    case "presence": {
      if (sub === "ping" && isPost(req)) return stubRoutes.presencePing(req);
      return error(404, "接口不存在");
    }
    case "emotes": {
      if (sub === "manifest" && isGet(req)) return emoteRoutes.manifest();
      return error(404, "接口不存在");
    }
    case "agent": {
      if (sub === "characters" && isGet(req)) return aiRoutes.characters();
      return error(404, "接口不存在");
    }
    case "dm": {
      // 会话列表：direct + group + AI 合并
      if (sub === "conversations" && s.length === 3 && isGet(req)) return dmRoutes.conversations(req);
      if (sub === "conversations" && sub2 === "direct" && isPost(req)) return dmRoutes.direct(req);
      if (sub === "conversations" && sub2 === "ai-session" && isPost(req)) return aiRoutes.aiSession(req);
      if (sub === "conversations" && sub2 === "group" && isPost(req)) return dmRoutes.createGroup(req);
      if (sub === "conversations" && s.length === 5 && s[4] === "members" && isPost(req)) return dmRoutes.addGroupMembers(req);
      // 会话级子路径：AI（ai- 前缀）与真实 DM 分开处理
      if (sub === "conversations" && s.length === 5 && s[4] === "messages" && isGet(req)) {
        return String(s[3]).startsWith("ai-") ? aiRoutes.messages(req) : dmRoutes.messages(req);
      }
      if (sub === "conversations" && s.length === 5 && s[4] === "messages" && isPost(req)) {
        return String(s[3]).startsWith("ai-") ? aiRoutes.sendMessage(req) : dmRoutes.sendMessage(req);
      }
      if (sub === "conversations" && s.length === 5 && s[4] === "read" && isPatch(req)) {
        return String(s[3]).startsWith("ai-") ? aiRoutes.readConversation(req) : dmRoutes.readConversation(req);
      }
      if (sub === "conversations" && s.length === 5 && s[4] === "leave" && isPost(req)) {
        return String(s[3]).startsWith("ai-") ? aiRoutes.leaveConversation(req) : dmRoutes.leaveConversation(req);
      }
      if (sub === "conversations" && s.length === 5 && s[4] === "reset-context" && isPost(req)) return dmRoutes.resetContext();
      if (sub === "conversations" && s.length === 4 && isPatch(req)) return dmRoutes.updateConversation(req);
      if (sub === "messages" && s.length === 4 && isPatch(req)) return dmRoutes.editMessage(req);
      if (sub === "messages" && s.length === 4 && isDelete(req)) return dmRoutes.withdrawMessage(req);
      if (sub === "read-all" && isPost(req)) return dmRoutes.readAll(req);
      if (sub === "ai" && sub2 === "regenerate" && isPost(req)) return aiRoutes.regenerate(req);
      if (sub === "ai" && sub2 === "stop" && isPost(req)) return aiRoutes.stop();
      if (sub === "socket" && sub2 === "ticket" && isPost(req)) return json({ data: { ticket: "", ttlSec: 0 } });
      return error(404, "接口不存在");
    }
    case "knock": {
      if (sub === "conversations" && isGet(req)) return stubRoutes.knockConversations();
      if (sub === "stream" && isGet(req)) return stubRoutes.knockStream();
      return error(404, "接口不存在");
    }

    // ── 站内通知 ─────────────────────────────────────
    case "notifications": {
      if (isGet(req)) return notificationRoutes.list(req);
      if (sub === "read-all" && isPost(req)) return notificationRoutes.readAll(req);
      return error(404, "接口不存在");
    }

    default:
      return error(404, "接口不存在");
  }
}
