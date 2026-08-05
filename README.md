# AI PRD Copilot（本地预览版）

面向 B 端中后台产品经理的 PRD 撰写提效工具：粘贴 / 上传材料 → AI 按自定义框架生成初稿 → 两阶段追问（框架覆盖检查 + 开发视角审查）→ 人工兜底 → Markdown 导出。

## 快速开始（零依赖，无需 npm install）

```bash
node server.js
```

浏览器打开 http://localhost:4100

也可以直接双击 `index.html` 用 Demo 模式体验（无 API Key 时前端纯本地生成；真实模型模式需要启动 server.js 做代理）。

## 两种 AI 模式

- **Demo 模式（默认）**：未配置 API Key 时自动启用，内置虚构样例（TCC 质检平台-列表页质检结果上移）。把样例材料粘贴进去即可看到完整输出。
- **真实模式（作品集 / 上线）**：Key 只配置在**服务端**，访客无需也不应填写自己的 Key。启动前设置环境变量：

```bash
OPENAI_API_KEY=sk-xxx AI_MODEL=gpt-4.1-mini node server.js
```

应用会先探测服务端是否已配置 Key（`/api/status`）：已配置 → 真实模型；未配置 → 自动回退 Demo 模式。前端不存储、不展示、不要求访客填写 Key。

## 作品集部署建议（面试官可直接体验）

1. **Key 只放服务端**：本地预览用 `OPENAI_API_KEY` 环境变量；正式部署用 Supabase Edge Function Secrets 或部署平台的 Secrets（GitHub Actions / 腾讯云云函数环境变量）。**不要**把 Key 写进前端代码或提交到 Git 历史。
2. **前端是纯静态资源**：可部署到腾讯云 COS / 静态网站托管并绑定域名，AI 请求指向 Supabase Edge Function（或在腾讯云起一个 Node 云函数做代理），Key 永远在服务端。
3. **防止滥用**：公开作品集会暴露你的 Key 用量，建议在 Edge Function 里加简单防护：请求来源校验（Referer / Origin）、单 IP 频率限制，或一个只给面试官看的演示口令。
4. 面试官打开链接即可用，不需要任何配置。

## 功能

- 输入页：粘贴文本 / 拖拽或点击上传 txt / md / pptx（PPT 在浏览器端提取文本）；支持从微信 / 飞书 / Teams 等聊天软件拖拽文件
- 框架章节：勾选式选择要生成的章节（默认全选 8 节：背景 / 目标 / 价值 / 改进点 / 数据层 / 后端 / 前端 / 验收 / 测试）
- 两阶段追问：阶段一框架覆盖检查 + 阶段二开发视角审查，每条带建议答案，支持逐条确认 / 修改 / 跳过、一键跳过全部
- 编辑页：分节编辑、溯源引用（点击来源查看原文段落）、未确认项清单、导出 / 复制 Markdown
- 数据持久化：浏览器 localStorage（后续切换 Supabase）
- 视觉：暗黑霓虹风（深海蓝-荧光柠绿径向渐变、噪点肌理、几何圆形构图），自适应 PC / 平板 / 手机任意窗口宽度

## 目录结构

```
index.html      单页应用入口
css/styles.css  样式
js/             前端逻辑（模板 / 存储 / Demo 生成 / 导出 / PPT 解析 / AI 调用 / 页面）
server.js       零依赖本地服务：静态文件 + /api/ai 模型代理
```

## 上线路线（待接入）

1. **GitHub**：代码推送到仓库；
2. **Supabase**：接入 Auth（用户登录）+ Postgres（项目 / 材料 / PRD / 追问记录 / 模板 / 偏好，启用 RLS）+ Storage（材料文件）；AI 调用放 Supabase Edge Function，Key 存 Secrets；
3. **腾讯云**：前端为纯静态资源，可直接部署到腾讯云 COS / 静态网站托管，绑定腾讯云域名；
4. 上线前将 `js/ai.js` 的请求地址由 `/api/ai` 切换为 Supabase Edge Function 地址。

## 安全提醒

- 不要把 API Key 提交到 Git，也不要粘贴到聊天工具里；
- 前端不保存 Key：本地预览的旧版设置项（浏览器 localStorage 填 Key）已移除，统一改为服务端持有。

## 备选版本

同级目录 `ai-prd-copilot-next/` 保留了一份 Next.js + TypeScript 版本（API 路由版），需要联网执行 `npm install` 后使用，适合后续走 Node 服务端部署的场景。
