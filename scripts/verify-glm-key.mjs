/**
 * GLM 密钥本地验证工具
 *
 * 用法：
 *   node scripts/verify-glm-key.mjs "你的key"                # 测试指定密钥
 *   GLM_API_KEY="你的key" node scripts/verify-glm-key.mjs    # 测试环境变量值
 *
 * 输出：
 *   - 密钥指纹（前4+后6位 + 长度），用于和线上报错文案比对
 *   - 实际请求智谱 API，报告 200 或 401 等状态
 *   - 若值为引号/空格包裹，会自动清洗并提示
 */
const testKey = process.argv[2] || process.env.GLM_API_KEY;
if (!testKey) {
  console.log("用法: node scripts/verify-glm-key.mjs \"<你的GLM_API_KEY>\"");
  console.log("  或: GLM_API_KEY=\"<key>\" node scripts/verify-glm-key.mjs");
  process.exit(1);
}

function clean(key) {
  if (!key) return "";
  let k = String(key).trim();
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }
  return k;
}

function fingerprint(key) {
  if (!key) return "(empty)";
  return `${key.slice(0, 4)}…${key.slice(-6)} (len=${key.length})`;
}

const raw = String(testKey);
const cleaned = clean(raw);
console.log("原始值长度:", raw.length, "| 清洗后长度:", cleaned.length);
if (raw !== cleaned) {
  console.log("⚠️  检测到首尾隐藏字符（引号/空格），已自动清洗。清洗前指纹:", fingerprint(cleaned));
  console.log("   raw 首尾字符:", JSON.stringify(raw[0]), JSON.stringify(raw[raw.length - 1]));
}
console.log("待测密钥指纹:", fingerprint(cleaned));

const res = await fetch("https://open.bigmodel.cn/api/paas/v4/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cleaned}`,
  },
  body: JSON.stringify({
    model: process.env.GLM_MODEL || "glm-4-flash",
    messages: [{ role: "user", content: "hi" }],
  }),
  signal: AbortSignal.timeout(20000),
});
const body = await res.text();
console.log("HTTP", res.status);
if (res.ok) {
  console.log("✅ 密钥有效:", body.slice(0, 120));
} else {
  console.log("❌ 密钥无效:", body.slice(0, 200));
  if (res.status === 401) {
    console.log("\n排查建议:");
    console.log("  1. 确认智谱开放平台(bigmodel.cn)该 key 未被删除/禁用");
    console.log("  2. 若这是从某处复制粘贴的值，检查是否带入引号或空格（本脚本已自动清洗）");
    console.log("  3. 该 key 若曾在 GitHub 公开，建议到智谱平台重新生成新 key");
  }
}
process.exit(res.ok ? 0 : 1);
