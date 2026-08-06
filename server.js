// AI PRD Copilot 本地预览服务（零依赖 · 纯静态）
// 用法：node server.js  然后打开 http://localhost:4100
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let filePath = path.normalize(path.join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === "ENOENT") {
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
});
