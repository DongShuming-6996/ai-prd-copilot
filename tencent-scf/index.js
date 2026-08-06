// 腾讯云云函数（SCF）· AI 代理
// 与 lib/ai-proxy.js 共用逻辑；环境变量在云函数里配置：
//   AI_API_BASE=https://api.deepseek.com
//   AI_API_KEY=sk-你的DeepSeekKey
//   AI_MODEL=deepseek-chat
//   USAGE_LIMIT=5
// 上传方式：把本文件 + lib/ai-proxy.js + js/demo.js 一起打包上传（保持相对路径）
const { handleAction } = require("./lib/ai-proxy.js");

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    isBase64Encoded: false,
    body: JSON.stringify(payload),
  };
}

exports.main_handler = async (event) => {
  if ((event.httpMethod || "").toUpperCase() === "OPTIONS") {
    return json(200, {});
  }

  const headers = event.headers || {};
  let parsed = {};
  try {
    const raw = typeof event.body === "string" ? event.body : JSON.stringify(event.body || "{}");
    parsed = JSON.parse(raw || "{}");
  } catch {
    return json(400, { error: "请求体不是合法 JSON" });
  }

  const ip = String(headers["x-forwarded-for"] || "").split(",")[0].trim() || "unknown";
  const r = await handleAction(parsed, { ip });
  return json(r.status, r.payload);
};
