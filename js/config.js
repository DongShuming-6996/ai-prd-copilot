// 生产环境 AI 代理地址配置（DeepSeek 等真实模型走这里）
// 留空 "" = 同源（本地 node server.js / Vercel 函数场景）
// 部署到 GitHub Pages 且使用腾讯云云函数等远程代理时，填完整地址，如：
// window.AI_API_BASE = "https://your-proxy-url";
// Vercel 代理地址（优先走服务端）
// Vercel 代理地址（优先走服务端，Key 在 Vercel 环境变量中，安全）
window.AI_API_BASE = "https://ai-prd-copilot-plum.vercel.app";
// 直连 Key 已移除：前端统一走 Vercel /api/ai 服务端代理，Key 存 Vercel 环境变量，永不进前端。
// 用户仍可通过顶部「设置 AI Key」使用自己的 Key（仅存浏览器本地 localStorage）。

// 每个访客（浏览器）的试用次数限制
window.AI_USAGE_LIMIT = 5;         // 最多生成次数
window.AI_USAGE_WINDOW = "total";  // "total"=累计限制 / "day"=每天重置
window.AI_USAGE_VERSION = 4;
window.AI_USAGE_WINDOW = "total";  // "total"=累计限制 / "day"=每天重置
