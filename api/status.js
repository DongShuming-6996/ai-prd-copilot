// Vercel Serverless Function：返回服务端是否已配置 Key（供前端探测）
const { hasServerKey } = require("../lib/ai-proxy.js");

module.exports = async function handler(req, res) {
  res.status(200).json({ hasEnvKey: hasServerKey() });
};
