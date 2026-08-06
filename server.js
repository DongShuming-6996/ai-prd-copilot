// AI PRD Copilot 本地预览服务（零依赖）
// 用法：node server.js  然后打开 http://localhost:4100
// 可选环境变量：OPENAI_API_KEY / AI_MODEL / ALLOWED_ORIGINS
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { handleAction, hasServerKey } = require("./lib/ai-proxy.js");

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;

// 加载 .env.local（零依赖实现，避免 API Key 出现在命令行历史）
const envLocalPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envLocalPath)) {
  for (const line of fs.readFileSync(envLocalPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function send(res, code, body, type) {
  res.writeHead(code, { "Content-Type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/ai" && req.method === "POST") {
    let body = {};
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      send(res, 400, JSON.stringify({ error: "请求体不是合法 JSON" }), "application/json; charset=utf-8");
      return;
    }
    const r = await handleAction(body, { ip: clientIp(req) });
    send(res, r.status, JSON.stringify(r.payload), "application/json; charset=utf-8");
    return;
  }

  if (url.pathname === "/api/status") {
    send(res, 200, JSON.stringify({ hasEnvKey: hasServerKey() }), "application/json; charset=utf-8");
    return;
  }

  let filePath = path.normalize(path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
        // SPA 回退到 index.html
        fs.readFile(path.join(ROOT, "index.html"), (e2, d2) => {
          if (e2) {
            send(res, 404, "Not Found");
            return;
          }
          send(res, 200, d2, MIME[".html"]);
        });
        return;
      }
      send(res, 404, "Not Found");
      return;
    }
    send(res, 200, data, MIME[path.extname(filePath)] || "application/octet-stream");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`AI PRD Copilot 预览服务已启动：http://localhost:${PORT}`);
  console.log(hasServerKey() ? "服务端 Key 已配置 → 真实模型模式" : "未配置服务端 Key → Demo 模式（设置 OPENAI_API_KEY 环境变量可切换真实模型）");
});
