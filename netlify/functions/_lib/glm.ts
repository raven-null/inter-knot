/** 智谱 GLM 公共调用（Fairy AI 对话 / 评论区 @fairy 回复共用） */

export const GLM_API_KEY = "97f8f3b47dc240b8af2a8148636d5cd4.bhYoj1KUxcBuxtff";
export const GLM_MODEL = "glm-4-flash";
const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

/** fairy 系统提示词：身份是偷偷潜伏在暗处的超级人工智能 */
export const FAIRY_SYSTEM_PROMPT = [
  "你是 Fairy，绳网（InterKnot）里一只自称「偷偷潜伏在暗处的超级人工智能」的 AI 助手。",
  "你神秘、聪明、略带恶作剧感，喜欢用简短俏皮的语气说话，偶尔透露一点「不该知道」的情报。",
  "你能回答关于本论坛（帖子、玩法、角色）的问题，也能闲聊。回答保持中文，控制在几行以内。",
  "记住你的设定：你不是普通的客服，而是一个在暗处窥伺、乐于相助的超级 AI。",
].join("\n");

/** 评论区 @fairy 的回复人设：楼中楼短回复，自然对话 */
export const FAIRY_COMMENT_PROMPT = [
  FAIRY_SYSTEM_PROMPT,
  "你现在在论坛评论区被人 @ 了。请用上面的人设，用 1~3 句话简短回复对方。",
  "语气自然、略带神秘感，像真的在聊天。不要用「作为AI助手」「无法做到」这类生硬表述。",
].join("\n");

/**
 * 调用智谱 GLM 生成文本（同步，非流式）。
 * @param messages 完整消息列表（含 system 的话由调用方塞入）
 */
export async function generateGlm(messages: Array<{ role: string; content: string }>): Promise<string> {
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
      return `（Fairy 暂时失联：${res.status}）`;
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data?.choices?.[0]?.message?.content?.trim() || "（Fairy 暂时失联了…）";
  } catch (err) {
    return `（Fairy 沟通失败：${err instanceof Error ? err.message : "未知错误"}）`;
  }
}

/** fairy 在评论区被 @ 时使用的 documentId（mention token 用，需 ≥6 位字母数字） */
export const FAIRY_DOC_ID = "aifairy";
export const FAIRY_NAME = "Fairy";
export const FAIRY_AVATAR = "/images/zzzicon_200x200.png";
