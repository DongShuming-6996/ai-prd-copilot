// AI 代理公共逻辑：本地 server.js / Vercel api/ai.js / 腾讯云 SCF 共用
// Key 只在服务端读取（环境变量 AI_API_KEY 或 OPENAI_API_KEY），永不进入前端
const Demo = require("../js/demo.js");
const https = require("node:https");
const http = require("node:http");
const dns = require("node:dns");
const tls = require("node:tls");

// OpenAI 兼容接口：DeepSeek 等模型只需改环境变量
// 例：AI_API_BASE=https://api.deepseek.com，AI_MODEL=deepseek-chat（或 deepseek-reasoner）
const API_BASE = (process.env.AI_API_BASE || "https://api.openai.com/v1").replace(/\/+$/, "");
const OPENAI_URL = API_BASE + "/chat/completions";

// 服务端按 IP 的每日试用次数限制（内存实现，单实例演示够用；
// 多实例 / 严格持久化建议后续接 Supabase 记录表）
const USAGE_LIMIT_PER_DAY = Number(process.env.USAGE_LIMIT || 5);
const usageMap = new Map();

function usageKey(ip) {
  const d = new Date();
  const day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  return (ip || "unknown") + ":" + day;
}

function consumeUsage(ip) {
  const k = usageKey(ip);
  const used = usageMap.get(k) || 0;
  if (used >= USAGE_LIMIT_PER_DAY) {
    return { ok: false, used, limit: USAGE_LIMIT_PER_DAY };
  }
  usageMap.set(k, used + 1);
  return { ok: true, used: used + 1, limit: USAGE_LIMIT_PER_DAY };
}

function peekUsage(ip) {
  const used = usageMap.get(usageKey(ip)) || 0;
  return { used, limit: USAGE_LIMIT_PER_DAY, ok: used < USAGE_LIMIT_PER_DAY };
}

// 兼容模型把 JSON 包在代码块或前后有多余文字的情况
function parseJSON(content) {
  const text = String(content || "").trim();
  try {
    return JSON.parse(text);
  } catch {
    // 继续尝试其他形式
  }
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // 继续
    }
  }
  const s = text.indexOf("{");
  const e = text.lastIndexOf("}");
  if (s >= 0 && e > s) {
    try {
      return JSON.parse(text.slice(s, e + 1));
    } catch {
      // 继续
    }
  }
  throw new Error("模型返回内容无法解析为 JSON");
}

// 用 Node 内置 http/https 模块发请求，并像 curl 一样遍历 DNS 返回的所有 IP，
// 跳过连不通的节点（解决部分网络下解析到错误 IP 导致 ECONNREFUSED）
function postJSON(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith("https:");
    const lib = isHttps ? https : http;
    const u = new URL(url);
    const payload = JSON.stringify(body);

    function requestOnce(hostname) {
      return new Promise((resolveOnce, rejectOnce) => {
        const req = lib.request(
          {
            hostname,
            port: u.port || (isHttps ? 443 : 80),
            path: u.pathname + u.search,
            method: "POST",
            servername: u.hostname,
            headers: Object.assign(
              {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                Host: u.hostname,
              },
              headers
            ),
          },
          (res) => {
            const chunks = [];
            res.on("data", (c) => chunks.push(c));
            res.on("end", () => {
              const text = Buffer.concat(chunks).toString("utf8");
              if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                try {
                  resolveOnce(parseJSON(text));
                } catch (e) {
                  rejectOnce(e);
                }
              } else {
                rejectOnce(new Error(`模型服务错误 ${res.statusCode}：${text.slice(0, 300)}`));
              }
            });
          }
        );
        req.setTimeout(timeoutMs || 30000, () => req.destroy(new Error("模型请求超时")));
        req.on("error", (e) => rejectOnce(e));
        req.end(payload);
      });
    }

    // 收集 IPv4 + IPv6 全部地址（类似 curl 的 Happy Eyeballs）
    const collectAddresses = (hostname) =>
      new Promise((resolveAll) => {
        const ips = [];
        let pending = 2;
        const done = () => {
          if (--pending === 0) resolveAll(ips);
        };
        dns.resolve4(hostname, (e, a) => {
          if (!e && Array.isArray(a)) ips.push(...a);
          done();
        });
        dns.resolve6(hostname, (e, a) => {
          if (!e && Array.isArray(a)) ips.push(...a);
          done();
        });
      });

    const tryAddresses = (addresses) => {
      const candidates = addresses && addresses.length ? addresses : [u.hostname];
      let index = 0;
      let lastErr = null;
      const next = () => {
        if (index >= candidates.length) {
          reject(new Error("连接模型服务失败：" + (lastErr ? lastErr.message : "所有地址均不可达")));
          return;
        }
        const host = candidates[index++];
        requestOnce(host)
          .then(resolve)
          .catch((e) => {
            lastErr = e;
            next();
          });
      };
      next();
    };

    collectAddresses(u.hostname).then(tryAddresses);
  });
}

async function chatJSON(system, user, apiKey, model) {
  const wrapper = await postJSON(
    OPENAI_URL,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
    },
    120000
  );
  // 从 OpenAI 兼容格式中提取 content，再解析为 JSON
  const content =
    (wrapper && wrapper.choices && wrapper.choices[0] && wrapper.choices[0].message && wrapper.choices[0].message.content) ||
    (typeof wrapper === "string" ? wrapper : "");
  if (!content || !content.trim()) throw new Error("模型返回内容为空");
  return parseJSON(content);
}

const DRAFT_SYSTEM = `你是一位资深 B 端中后台产品经理，擅长按照给定框架撰写 PRD。
严格遵循用户提供的框架章节与撰写要求，逐节撰写内容。
输出必须是合法 JSON，格式为：
{"name":"项目名称","sections":[{"key":"章节key","title":"章节标题","content":"正文，Markdown 格式","sources":[{"materialLabel":"材料名称","snippet":"原文摘录，不超过100字"}]}]}

【项目名称规范——最重要】
顶层 name 字段和"name"章节（key=name）的 content 必须是同一个项目名称，且必须严格遵循命名规范：【业务线】业务分支+改进点。
示例：【质检】CS质检平台-UI列表页改版、【交易】订单列表-筛选性能优化。
禁止把"name"章节写成背景、目标或其他内容，它就是一句话的项目名称，不含其他解释。

【关键要求——数据层/后端层/前端层必须完全不同】
以下三节的 content 绝对不能雷同或互相复制，每节从不同角色视角撰写，使用该角色专属的术语和关注点：

数据层（key=data）：从数据工程师和BI的视角写。内容包括——涉及的数据表名和字段名；数据来源系统；数据同步策略(T+1/实时/增量)；字段计算口径和最小粒度；数据关联键(如 case_id)；BI数仓视图设计；跨部门数据协作(本组做什么/BI做什么/先后关系)；历史数据回填方案。不要写任何关于后端接口或前端页面的内容。

后端层（key=backend）：从后端开发工程师的视角写。内容包括——需要新增或修改的接口(GET/POST路径和参数)；服务端业务逻辑；权限校验规则(角色/可见范围/接口层二次校验)；性能指标(P95耗时/QPS/数据量级)；缓存策略；异常处理机制；审计日志需求；与数据层的对接方式。不要写任何关于数据表设计或前端组件的内容。

前端层（key=frontend）：从前端开发工程师的视角写。内容包括——涉及的页面和组件；交互细节(筛选单选还是多选/排序规则/分页/高亮策略)；空态、加载态、错误态的处理方式；是否需要UI设计稿；多端适配需求(PC/平板/手机)；操作反馈(loading/成功/失败提示)。不要写任何关于数据库或后端接口的内容。

其他要求：
1. 每节内容必须完整、具体、可直接评审，三层的章节内容绝对不能雷同或互相复制；
2. 改进点用列表格式逐条写，每条格式为"[P0/P1/P2] 现状：xxx → 改后：xxx（Deadline：待填写）"，不要用表格；
3. 测试说明必须包含：功能点、用例建议（编号/前置条件/操作步骤/预期结果/优先级）、异常允许程度；
4. 内容必须来自用户提供的材料，不能编造不存在的事实；材料没有覆盖的章节写"（待补充：原始材料未覆盖...）"；
5. sources 标注该章节内容主要来自哪份材料。`;

const QUESTIONS_SYSTEM = `你是一位资深 B 端中后台产品经理，同时模拟一位开发工程师的视角审查 PRD。
基于"原始材料 + 已生成 PRD 初稿"，产出两阶段追问清单。只输出一个 JSON 对象，不要 markdown 代码块：

{"questions":[{"stage":1,"sectionKey":"章节key","question":"追问问题","suggestedAnswer":"参考答案——可直接填入PRD的具体文字","actionGuidance":"行动建议——告诉用户应该补充什么方向的信息","priority":"P0|P1|P2","impact":"不填写的风险是什么","dataLayer":true|false}]}

字段说明：
- suggestedAnswer：参考答案，是一段可直接填入 PRD 正文的具体文字，用户点击"使用建议答案"后会被填入文本框
- actionGuidance：行动建议，告诉用户应该从哪个方向补充信息，显示在"建议"提示行
- impact：缺失风险，如果这条追问不处理会导致什么问题

阶段一（stage=1，框架覆盖检查）：逐节检查初稿是否被原始材料覆盖。若某节为空或"（待补充）"，追问并要求补充，suggestedAnswer 给出具体可填入的文字。至少 3 条。
阶段二（stage=2，开发视角审查）：以开发工程师身份通读初稿，找出模糊或缺失的细节，如字段口径、关联键、权限边界、交互细节、异常分支、性能指标等。至少 3 条，含 1 条 dataLayer=true。
sectionKey 必须精确匹配提供的章节 key，不要编造。`;

function normalizeDraft(raw, sections) {
  const raws = Array.isArray(raw?.sections) ? raw.sections : [];
  // 多层匹配：key → 标题编号 → 标题关键词 → 索引
  const byKey = {}; for (const s of raws) { if (s && s.key) byKey[s.key] = s; }
  const byNum = {}; for (const s of raws) { const m = String(s?.title || "").match(/^\s*(\d+)/); if (m) byNum[m[1]] = s; }

  function matchSection(def) {
    // 1. 精确 key 匹配
    if (byKey[def.key]) return byKey[def.key];
    // 2. 编号匹配
    const num = String(def.title).match(/^\s*(\d+)/);
    if (num && byNum[num[1]]) return byNum[num[1]];
    // 3. 标题关键词模糊匹配
    const defTitle = (def.title || "").toLowerCase();
    for (const s of raws) {
      const rawTitle = (s.title || "").toLowerCase();
      if (rawTitle && defTitle && (defTitle.indexOf(rawTitle) >= 0 || rawTitle.indexOf(defTitle) >= 0)) return s;
    }
    // 4. key 前缀匹配（如 "data" 匹配 "6.1 数据层"）
    if (def.key) {
      const keyLower = def.key.toLowerCase();
      for (const s of raws) {
        const rawKey = (s.key || "").toLowerCase();
        if (rawKey && (rawKey.indexOf(keyLower) >= 0 || keyLower.indexOf(rawKey) >= 0)) return s;
      }
    }
    return null;
  }

  return {
    name: (raw?.name || "").trim() || "未命名项目",
    sections: sections.map((def, i) => {
      const hit = matchSection(def) || raws[i];
      return {
        key: def.key,
        title: def.title,
        content: (hit?.content || "").trim() || "（待补充：原始材料未覆盖）",
        sources: Array.isArray(hit?.sources)
          ? hit.sources.filter((s) => s && s.materialLabel).map((s) => ({ materialId: "", materialLabel: String(s.materialLabel), snippet: String(s.snippet ?? "").slice(0, 200) }))
          : [],
      };
    }),
  };
}

function normalizeQuestions(raw, sections) {
  const list = Array.isArray(raw) ? raw : raw?.questions || raw?.data?.questions;
  if (!Array.isArray(list)) return [];
  const titles = {};
  const nums = {};
  for (const s of sections) {
    titles[s.key] = s.title;
    const m = String(s.title).match(/^\s*(\d+)/);
    if (m) nums[m[1]] = s.key;
  }
  const resolveKey = (k) => {
    const key = String(k || "").trim();
    if (!key) return Object.keys(titles)[0] || ""; // 兜底：分配到第一个章节
    if (titles[key]) return key;
    if (nums[key]) return nums[key];
    // 模糊匹配：按章节标题关键词
    for (const sk of Object.keys(titles)) {
      const t = titles[sk];
      if (key && (t.indexOf(key) >= 0 || key.indexOf(t.replace(/^\s*\d+[.．、\s]*/, "")) >= 0)) return sk;
    }
    // 最后兜底：分配到第一个章节
    return Object.keys(titles)[0] || "";
  };
  return list
    .filter((q) => q && typeof q === "object")
    .map((q, i) => {
      const stage = q.stage === 2 ? 2 : 1;
      const sectionKey = resolveKey(q.sectionKey);
      const priority = ["P0", "P1", "P2"].includes(String(q.priority)) ? String(q.priority) : "P1";
      return {
        id: `q-${i + 1}`,
        stage,
        sectionKey,
        sectionTitle: titles[sectionKey] ?? String(q.sectionTitle ?? sectionKey),
        impact: q.impact ? String(q.impact) : undefined,
        question: String(q.question ?? "待确认问题"),
        suggestedAnswer: String(q.suggestedAnswer ?? ""),
        actionGuidance: String(q.actionGuidance ?? ""),
        answer: "",
        priority,
        status: "pending",
        dataLayer: Boolean(q.dataLayer),
      };
    });
}

async function handleAction(body, meta) {
  const apiKey = (body.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
  const model = (body.model || process.env.AI_MODEL || "gpt-4.1-mini").trim();
  const ip = (meta && meta.ip) || "unknown";

  try {
    // Demo 模式：无 Key 时用内置生成器（不计数）
    if (!apiKey) {
      if (body.action === "draft" && Array.isArray(body.materials) && Array.isArray(body.sections)) {
        return { status: 200, payload: { usedDemo: true, ...Demo.generateDraft(body.materials, body.sections, Boolean(body.crossDept)) } };
      }
      if (body.action === "questions" && Array.isArray(body.draftSections) && Array.isArray(body.materials)) {
        const prefs = body.prefs || { askDataSource: true, askDeadline: true, checkCalcLogic: false };
        return { status: 200, payload: { usedDemo: true, questions: Demo.generateQuestions(body.draftSections, body.materials, prefs) } };
      }
      if (body.action === "enhance" && Array.isArray(body.draftSections)) {
        return { status: 200, payload: { usedDemo: true, questions: Demo.generateEnhance(body.existing || [], body.draftSections, body.materials || []) } };
      }
      return { status: 400, payload: { error: "缺少必要参数" } };
    }

    // 真实模型：每次生成（初稿 / 加强追问）消耗 1 次额度（成功后才计数）
    const countUsage = ["draft", "enhance"].includes(body.action);
    const peek = countUsage ? peekUsage(ip) : null;
    if (peek && !peek.ok) {
      return {
        status: 429,
        payload: {
          error: `今日 AI 生成次数已达上限（${USAGE_LIMIT_PER_DAY} 次），请明天再来体验。`,
          usage: { used: peek.used, limit: peek.limit },
        },
      };
    }

    if (body.action === "draft" && Array.isArray(body.materials) && Array.isArray(body.sections)) {
      const user = [
        `跨部门协作开关：${body.crossDept ? "开" : "关"}`,
        `追问偏好：数据来源与关联方式必问=${body.prefs?.askDataSource ? "是" : "否"}，Deadline 提醒=${body.prefs?.askDeadline ? "是" : "否"}，字段计算逻辑检查=${body.prefs?.checkCalcLogic ? "是" : "否"}`,
        `框架章节（严格按此撰写）：\n${body.sections.map((s) => `${s.title}（${s.description || ""}）`).join("\n")}`,
        `原始材料：\n${body.materials.map((m) => `--- 材料：${m.label} ---\n${m.text}`).join("\n\n")}`,
      ].join("\n\n");
      const raw = await chatJSON(DRAFT_SYSTEM, user, apiKey, model);
      const u = countUsage ? consumeUsage(ip) : null;
      return {
        status: 200,
        payload: {
          usedDemo: false,
          usage: u ? { used: u.used, limit: u.limit } : undefined,
          ...normalizeDraft(raw, body.sections),
        },
      };
    }

    if (body.action === "questions" && Array.isArray(body.draftSections) && Array.isArray(body.materials)) {
      const user = [
        `框架章节：\n${(body.sections || []).map((s) => `${s.title}（${s.description || ""}）`).join("\n")}`,
        `PRD 初稿：\n${body.draftSections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n")}`,
        `原始材料：\n${body.materials.map((m) => `--- 材料：${m.label} ---\n${m.text}`).join("\n\n")}`,
        `追问偏好：数据来源与关联方式必问=${body.prefs?.askDataSource ? "是" : "否"}，Deadline 提醒=${body.prefs?.askDeadline ? "是" : "否"}。`,
      ].join("\n\n");
      const raw = await chatJSON(QUESTIONS_SYSTEM, user, apiKey, model);
      const questions = normalizeQuestions(raw, body.sections || []);
      return { status: 200, payload: { usedDemo: false, questions } };
    }

    if (body.action === "enhance" && Array.isArray(body.draftSections)) {
      const user = [
        `框架章节：\n${(body.sections || []).map((s) => `${s.title}（${s.description || ""}）`).join("\n")}`,
        `PRD 初稿：\n${body.draftSections.map((s) => `## ${s.title}\n${s.content}`).join("\n\n")}`,
        `原始材料：\n${(body.materials || []).map((m) => `--- 材料：${m.label} ---\n${m.text}`).join("\n\n")}`,
        `已有追问（不要重复）：\n${(body.existing || []).map((q) => `- ${q.question}`).join("\n")}`,
        "请只产出与已有追问不重复的新问题，聚焦初稿中仍缺失、模糊或未写详细的部分。",
      ].join("\n\n");
      const raw = await chatJSON(QUESTIONS_SYSTEM + "\n只产出与已有追问不重复的新问题。", user, apiKey, model);
      const u = countUsage ? consumeUsage(ip) : null;
      const questions = normalizeQuestions(raw, body.sections || []);
      return {
        status: 200,
        payload: {
          usedDemo: false,
          usage: u ? { used: u.used, limit: u.limit } : undefined,
          questions,
        },
      };
    }

    return { status: 400, payload: { error: "未知操作" } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 服务异常";
    // 检测 401/403 认证错误，前端可据此自动降级 Demo
    const authMatch = msg.match(/模型服务错误\s+(401|403)/);
    if (authMatch) {
      return {
        status: Number(authMatch[1]),
        payload: { error: msg, authError: true },
      };
    }
    const cause = e && e.cause && e.cause.message ? `（${e.cause.message}）` : "";
    const code = e && e.code ? ` [${e.code}]` : "";
    return {
      status: 500,
      payload: { error: `${msg}${code}${cause}` },
    };
  }
}

function hasServerKey() {
  return Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
}

// 诊断：解析模型域名所有 IP 并逐个测试 TLS 连通性（浏览器访问 /api/diag 即可查看）
async function resolveIps(hostname) {
  const ips = [];
  await new Promise((r) => {
    dns.resolve4(hostname, (e, a) => {
      if (!e && Array.isArray(a)) ips.push(...a.map((x) => ({ ip: x, family: 4 })));
      r();
    });
  });
  await new Promise((r) => {
    dns.resolve6(hostname, (e, a) => {
      if (!e && Array.isArray(a)) ips.push(...a.map((x) => ({ ip: x, family: 6 })));
      r();
    });
  });
  return ips;
}

function testTlsConnect(ip, hostname) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    const socket = tls.connect(
      { host: ip, port: 443, servername: hostname, timeout: 5000, rejectUnauthorized: false },
      () => {
        socket.destroy();
        finish("TLS_OK");
      }
    );
    socket.on("timeout", () => {
      socket.destroy();
      finish("TIMEOUT");
    });
    socket.on("error", (e) => {
      finish("FAIL:" + (e.code || e.message));
    });
  });
}

async function diag() {
  let host = "";
  try {
    host = new URL(API_BASE).hostname;
  } catch {
    return { error: "AI_API_BASE 无法解析：" + API_BASE };
  }
  const ips = await resolveIps(host);
  const results = [];
  for (const item of ips) {
    results.push({ ip: item.ip, family: "v" + item.family, result: await testTlsConnect(item.ip, host) });
  }
  return {
    diagVersion: "v2",
    apiBase: API_BASE,
    host,
    model: process.env.AI_MODEL || "gpt-4.1-mini",
    hasKey: hasServerKey(),
    dnsServers: dns.getServers(),
    ipCount: ips.length,
    results,
    note: "TLS_OK=该 IP 可正常 TLS 握手；TIMEOUT/FAIL=该 IP 不可达",
  };
}

module.exports = { handleAction, hasServerKey, consumeUsage, USAGE_LIMIT_PER_DAY, diag };
