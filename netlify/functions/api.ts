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
import * as githubRoutes from "./_lib/routes/github";
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
      if (sub === "local" && isPost(req)) return authRoutes.login(req);
      if (sub === "renew" && isPost(req)) return authRoutes.renew(req);
      if (sub === "send-register-code" && isPost(req)) return authRoutes.sendRegisterCode(req);
      if (sub === "register-with-code" && isPost(req)) return authRoutes.registerWithCode(req);
      if (sub === "send-reset-code" && isPost(req)) return authRoutes.sendResetCode(req);
      if (sub === "reset-password" && isPost(req)) return authRoutes.resetPassword(req);
      if (sub === "mihoyo" && sub2 === "qr" && s.length === 4 && isPost(req)) return stubRoutes.mihoyoQrCreate();
      if (sub === "mihoyo" && sub2 === "qr" && s[4] === "status" && isPost(req)) return stubRoutes.mihoyoQrStatus();
      if (sub === "mihoyo" && sub2 === "binding" && isGet(req)) return stubRoutes.mihoyoBinding();
      if (sub === "mihoyo" && sub2 === "binding" && isDelete(req)) return stubRoutes.mihoyoUnbind();
      return error(404, "接口不存在");
    }

    // ── 帖子 / 委托 ─────────────────────────────────
    case "articles": {
      if (sub === "list" && isGet(req)) return articleRoutes.list(req);
      if (sub === "search" && isGet(req)) return articleRoutes.list(req);
      if (sub === "suggest" && isGet(req)) return articleRoutes.suggest(req);
      if (sub === "triple" && isPost(req)) return articleRoutes.triple(req);
      if (sub === "bilibili-info" && isGet(req)) return articleRoutes.bilibiliInfo();
      if (sub === "my" && sub2 === "drafts" && isGet(req)) return articleRoutes.myDrafts(req);
      if (sub === "my" && sub2 === "detail" && isGet(req)) return articleRoutes.myDraftDetail(req);
      if (sub === "detail" && isGet(req)) return articleRoutes.detail(req);
      if (s.length >= 4 && sub2 === "view" && isPost(req)) return articleRoutes.view(req);
      if (s.length >= 4 && sub2 === "publish" && isPost(req)) return articleRoutes.publishDraft(req);
      if (s.length >= 4 && sub2 === "discard-draft" && isPost(req)) return articleRoutes.discardDraft(req);
      if (s.length === 3 && isPost(req)) return articleRoutes.createDraft(req);
      if (s.length === 3 && isPut(req)) return articleRoutes.updateDraft(req);
      if (s.length === 3 && isDelete(req)) return articleRoutes.remove(req);
      return error(404, "接口不存在");
    }

    // ── 评论 ─────────────────────────────────────────
    case "comments": {
      if (sub === "list" && isGet(req)) return commentRoutes.list(req);
      if (s.length === 3 && isPost(req)) return commentRoutes.create(req);
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

    // ── GitHub OAuth 登录 ────────────────────────────
    case "github": {
      if (sub === "callback" && isPost(req)) return githubRoutes.callback(req);
      return error(404, "接口不存在");
    }

    // ── 个人主页 ─────────────────────────────────────
    case "profiles": {
      if (sub2 === "articles" && isGet(req)) return profileRoutes.articles(req);
      if (sub2 === "comments" && isGet(req)) return profileRoutes.comments(req);
      if (s.length === 3 && isGet(req)) return profileRoutes.detail(req);
      return error(404, "接口不存在");
    }

    // ── 我的 ─────────────────────────────────────────
    case "me": {
      if (sub === "profile" && s.length === 3 && isGet(req)) return authRoutes.meProfile(req);
      if (sub === "profile" && sub2 === "name" && isPut(req)) return meRoutes.updateName(req);
      if (sub === "profile" && sub2 === "bio" && isPut(req)) return meRoutes.updateBio(req);
      if (sub === "profile" && sub2 === "visibility" && isPut(req)) return meRoutes.updateVisibility(req);
      if (sub === "profile" && sub2 === "pinned-articles" && isGet(req)) return meRoutes.pinnedArticles();
      if (sub === "profile" && sub2 === "pinned-articles" && isPut(req)) return meRoutes.updatePinnedArticles(req);
      if (sub === "security" && isGet(req)) return meRoutes.security(req);
      if (sub === "email" && sub2 === "send-code" && isPost(req)) return meRoutes.sendBindEmailCode(req);
      if (sub === "email" && s.length === 3 && isPut(req)) return meRoutes.bindEmail(req);
      if (sub === "uploads" && s.length === 3 && isGet(req)) return meRoutes.uploads(req);
      if (sub === "uploads" && s.length === 4 && isDelete(req)) return meRoutes.deleteUpload(req);
      if (sub === "business-cards" && sub2 === "equip" && isPut(req)) return meRoutes.equipBusinessCard();
      if (sub === "business-cards" && isGet(req)) return meRoutes.businessCards();
      if (sub === "avatars" && sub2 === "equip" && isPut(req)) return meRoutes.equipAvatar();
      if (sub === "avatars" && sub2 === "upload-custom" && isPut(req)) return meRoutes.uploadCustomAvatar(req);
      if (sub === "avatars" && s.length === 3 && isGet(req)) return meRoutes.avatars();
      if (sub === "exp" && sub2 === "daily" && isGet(req)) return meRoutes.dailyExp();
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

    // ── 后台管理 ─────────────────────────────────────
    case "admin": {
      if (sub === "stats" && isGet(req)) return adminRoutes.stats(req);
      if (sub === "users" && s.length === 3 && isGet(req)) return adminRoutes.users(req);
      if (sub === "users" && s.length === 4 && isPatch(req)) return adminRoutes.updateUser(req);
      if (sub === "posts" && s.length === 3 && isGet(req)) return adminRoutes.posts(req);
      if (sub === "posts" && s.length === 4 && isPatch(req)) return adminRoutes.updatePost(req);
      if (sub === "comments" && s.length === 3 && isGet(req)) return adminRoutes.comments(req);
      if (sub === "comments" && s.length === 4 && isDelete(req)) return adminRoutes.deleteComment(req);
      if (sub === "categories" && s.length === 3 && isGet(req)) return adminRoutes.categories(req);
      if (sub === "categories" && s.length === 3 && isPost(req)) return adminRoutes.createCategory(req);
      if (sub === "categories" && s.length === 4 && isPut(req)) return adminRoutes.updateCategory(req);
      if (sub === "categories" && s.length === 4 && isDelete(req)) return adminRoutes.deleteCategory(req);
      if (sub === "settings" && isGet(req)) return adminRoutes.settings(req);
      if (sub === "settings" && isPut(req)) return adminRoutes.updateSettings(req);
      return error(404, "接口不存在");
    }

    // ── 外围功能（桩） ───────────────────────────────
    case "user-denny": {
      if (s.length === 2 && isGet(req)) return stubRoutes.denny();
      if (sub === "give" && isPost(req)) return stubRoutes.dennyGive();
      return error(404, "接口不存在");
    }
    case "check-in": {
      if (sub === "status" && isGet(req)) return stubRoutes.checkInStatus();
      if (s.length === 2 && isPost(req)) return stubRoutes.checkIn();
      return error(404, "接口不存在");
    }
    case "benefits": {
      if (sub === "me" && isGet(req)) return stubRoutes.benefitsMe();
      return error(404, "接口不存在");
    }
    case "exam": {
      if (sub === "status" && isGet(req)) return stubRoutes.examStatus();
      if (sub === "start" && isPost(req)) return stubRoutes.examStart();
      if (sub === "submit" && isPost(req)) return stubRoutes.examSubmit();
      if (sub === "review" && isGet(req)) return stubRoutes.examReview();
      return error(404, "接口不存在");
    }
    case "presence": {
      if (sub === "ping" && isPost(req)) return stubRoutes.presencePing();
      return error(404, "接口不存在");
    }
    case "emotes": {
      if (sub === "manifest" && isGet(req)) return stubRoutes.emotesManifest();
      return error(404, "接口不存在");
    }
    case "agent": {
      if (sub === "characters" && isGet(req)) return stubRoutes.agentCharacters();
      return error(404, "接口不存在");
    }
    case "dm": {
      if (sub === "conversations" && s.length === 3 && isGet(req)) return stubRoutes.dmConversations();
      if (sub === "conversations" && sub2 === "direct" && isPost(req)) return stubRoutes.dmDirect();
      if (sub === "conversations" && sub2 === "ai-session" && isPost(req)) return stubRoutes.dmAiSession();
      if (sub === "read-all" && isPost(req)) return stubRoutes.dmReadAll();
      if (sub === "ai" && (sub2 === "stop" || sub2 === "regenerate") && isPost(req)) return stubRoutes.dmAiAction();
      if (sub === "socket" && sub2 === "ticket" && isPost(req)) return stubRoutes.dmSocketTicket();
      return error(404, "接口不存在");
    }
    case "knock": {
      if (sub === "conversations" && isGet(req)) return stubRoutes.knockConversations();
      return error(404, "接口不存在");
    }

    default:
      return error(404, "接口不存在");
  }
}
