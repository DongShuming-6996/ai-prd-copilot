// Vercel Serverless Function：AI 代理（Key 只存服务端环境变量）
const { handleAction } = require("../lib/ai-proxy.js");

module.exports = async function handler(req, res) {
  // 可选来源校验：设置 ALLOWED_ORIGINS（逗号分隔）后只允许指定域名调用
  const allowed = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length) {
    const origin = req.headers.origin || req.headers.referer || "";
    if (!allowed.some((o) => origin.startsWith(o))) {
      res.status(403).json({ error: "来源不被允许" });
      return;
    }
  }

  let body = {};
  try {
    const raw = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      req.on("error", reject);
    });
    body = JSON.parse(raw || "{}");
  } catch {
    res.status(400).json({ error: "请求体不是合法 JSON" });
    return;
  }

  const r = await handleAction(body);
  res.status(r.status).json(r.payload);
};
