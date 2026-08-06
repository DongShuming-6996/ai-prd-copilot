// AI 代理公共逻辑：本地 server.js / Vercel api/ai.js / 腾讯云 SCF 共用
// Key 只在服务端读取（环境变量 AI_API_KEY 或 OPENAI_API_KEY），永不进入前端
const Demo = require("../js/demo.js");

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

async function chatJSON(system, user, apiKey, model) {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`模型服务错误 ${res.status}：${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("模型返回内容无法解析为 JSON");
  }
}

const DRAFT_SYSTEM = `你是一位资深 B 端中后台产品经理，擅长按照给定框架撰写 PRD。
严格遵循用户提供的框架章节与撰写要求，逐节撰写内容。
输出必须是合法 JSON，格式为：
{"name":"项目名称","sections":[{"key":"章节key","title":"章节标题","content":"正文，Markdown 格式","sources":[{"materialLabel":"材料名称","snippet":"原文摘录，不超过100字"}]}]}
要求：
1. 每节内容必须完整、具体、可直接评审；
2. 改进点必须写清"从什么改成什么"，标注优先级 P0/P1/P2，Deadline 写"待填写"（不代排）；
3. 数据层：若跨部门协作为开，必须拆分"本组/跨部门（如 BI）各需要做什么 + 两个部门动作先后关系"，并给出关键字段的数据来源与关联方式；
4. 测试说明必须包含：功能点、用例建议（编号/前置条件/操作步骤/预期结果/优先级）、异常允许程度（允许/不允许 + 处理方式）；
5. 内容必须来自用户提供的材料，不能编造材料中不存在的事实；材料没有覆盖的章节写"（待补充：原始材料未覆盖...）"；
6. sources 标注该章节内容主要来自哪份材料。`;

const QUESTIONS_SYSTEM = `你是一位资深 B 端中后台产品经理，同时模拟一位开发工程师的视角审查 PRD。
你的任务是基于"原始材料 + 已生成 PRD 初稿"，产出两阶段追问清单，输出必须是合法 JSON：
{"questions":[{"stage":1,"sectionKey":"章节key","question":"追问问题","suggestedAnswer":"建议答案，没有则留空","priority":"P0|P1|P2","impact":"影响说明","dataLayer":true|false}]}

阶段一（框架覆盖检查）：逐节检查初稿是否被原始材料覆盖。若某节内容为空或为"（待补充...）"，追问要求用户补充；同时检查改进点是否缺 Deadline（AI 不代排）、数据来源与关联方式是否缺失。
阶段二（开发视角审查）：以开发工程师身份通读初稿，找出看不懂、难以理解、没写详细的地方，例如：字段计算口径、数据关联键、权限边界、交互细节（单选/多选、高亮范围）、异常分支、性能指标、历史数据处理范围等。
每条追问必须具体、可回答，建议答案尽量给出默认值或示例；优先级按影响面判断。`;

function normalizeDraft(raw, sections) {
  const byKey = {};
  for (const s of raw?.sections ?? []) if (s && s.key) byKey[s.key] = s;
  return {
    name: (raw?.name || "").trim() || "未命名项目",
    sections: sections.map((def) => {
      const hit = byKey[def.key];
      return {
        key: def.key,
        title: def.title,
        content: (hit?.content || "").trim() || "（待补充：原始材料未覆盖）",
        sources: Array.isArray(hit?.sources)
          ? hit.sources
              .filter((s) => s && s.materialLabel)
              .map((s) => ({
                materialId: "",
                materialLabel: String(s.materialLabel),
                snippet: String(s.snippet ?? "").slice(0, 200),
              }))
          : [],
      };
    }),
  };
}

function normalizeQuestions(raw, sections) {
  const list = raw?.questions;
  if (!Array.isArray(list)) return [];
  const titles = {};
  for (const s of sections) titles[s.key] = s.title;
  return list
    .filter((q) => q && typeof q === "object")
    .map((q, i) => {
      const stage = q.stage === 2 ? 2 : 1;
      const sectionKey = String(q.sectionKey ?? "");
      const priority = ["P0", "P1", "P2"].includes(String(q.priority)) ? String(q.priority) : "P1";
      return {
        id: `q-${i + 1}`,
        stage,
        sectionKey,
        sectionTitle: titles[sectionKey] ?? String(q.sectionTitle ?? sectionKey),
        impact: q.impact ? String(q.impact) : undefined,
        question: String(q.question ?? "待确认问题"),
        suggestedAnswer: String(q.suggestedAnswer ?? ""),
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

    // 真实模型：每次生成（初稿 / 加强追问）消耗 1 次额度
    const countUsage = ["draft", "enhance"].includes(body.action);
    const u = countUsage ? consumeUsage(ip) : null;
    if (u && !u.ok) {
      return {
        status: 429,
        payload: {
          error: `今日 AI 生成次数已达上限（${USAGE_LIMIT_PER_DAY} 次），请明天再来体验。`,
          usage: { used: u.used, limit: u.limit },
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
      return {
        status: 200,
        payload: {
          usedDemo: false,
          usage: { used: u.used, limit: u.limit },
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
      const questions = normalizeQuestions(raw, body.sections || []);
      return {
        status: 200,
        payload: {
          usedDemo: false,
          usage: { used: u.used, limit: u.limit },
          questions,
        },
      };
    }

    return { status: 400, payload: { error: "未知操作" } };
  } catch (e) {
    return { status: 500, payload: { error: e instanceof Error ? e.message : "AI 服务异常" } };
  }
}

function hasServerKey() {
  return Boolean(process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
}

module.exports = { handleAction, hasServerKey, consumeUsage, USAGE_LIMIT_PER_DAY };
