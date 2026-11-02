// Vercel Serverless Function：AI 代理（Key 只存服务端环境变量）
const { handleAction } = require("../lib/ai-proxy.js");

module.exports = async function handler(req, res) {
  // CORS：允许前端（GitHub Pages）跨域调用本函数
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  // 浏览器跨域预检（OPTIONS）直接放行，不进入业务逻辑
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

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

  const ip = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim() || req.socket.remoteAddress;
  const r = await handleAction(body, { ip });
  res.status(r.status).json(r.payload);
};
