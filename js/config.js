// 生产环境 AI 代理地址配置（DeepSeek 等真实模型走这里）
// 留空 "" = 同源（本地 node server.js / Vercel 函数场景）
// 部署到 GitHub Pages 且使用腾讯云云函数等远程代理时，填完整地址，如：
// window.AI_API_BASE = "https://your-proxy-url";
// Vercel 代理地址（优先走服务端）
// Vercel 代理地址（优先走服务端，Key 在 Vercel 环境变量中，安全）
window.AI_API_BASE = "https://ai-prd-copilot-plum.vercel.app";
// 备用直连 Key（仅本地调试用，留空则走 Demo）
window.AI_DIRECT_KEY = "c2stMTViOWRhNWQ2NTg0NDhiYWJhYmI4YTZiMDZiYTRjMTc=";
window.AI_DIRECT_BASE = "https://api.deepseek.com";
window.AI_DIRECT_MODEL = "deepseek-chat";

// 每个访客（浏览器）的试用次数限制
window.AI_USAGE_LIMIT = 5;         // 最多生成次数
window.AI_USAGE_WINDOW = "total";  // "total"=累计限制 / "day"=每天重置
window.AI_USAGE_VERSION = 3;       // 递增强制重置计数
window.AI_USAGE_WINDOW = "total";  // "total"=累计限制 / "day"=每天重置
