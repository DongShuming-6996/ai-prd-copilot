(function (global) {
  var serverHasKey = null; // null=未知，true/false=服务端是否配置了 Key
  var API_BASE = (typeof window !== "undefined" && window.AI_API_BASE) || "";
  var serverKeyInvalid = false; // 服务端 Key 被判定为无效（401/403）

  async function checkServerKey() {
    if (serverHasKey !== null) return serverHasKey;
    // 如果已配置直连 Key，跳过服务端检测节省时间
    var dk = (typeof window !== "undefined" && window.AI_DIRECT_KEY) || "";
    if (dk) { serverHasKey = false; return false; }
    try {
      var controller = new AbortController();
      var timeout = setTimeout(function () { controller.abort(); }, 3000);
      var res = await fetch(API_BASE + "/api/status", { method: "GET", signal: controller.signal });
      clearTimeout(timeout);
      var data = await res.json();
      serverHasKey = !!(data && data.hasEnvKey);
    } catch (e) {
      serverHasKey = false;
    }
    return serverHasKey;
  }

  function fallbackToDemo(action, payload) {
    if (action === "draft") {
      return Object.assign({ usedDemo: true, demoReason: "模型服务不可用，使用内置 Demo 生成" }, Demo.generateDraft(payload.materials, payload.sections, payload.crossDept));
    }
    if (action === "enhance") {
      return { usedDemo: true, demoReason: "模型服务不可用，使用内置追问", questions: Demo.generateEnhance(payload.existing, payload.draftSections, payload.materials) };
    }
    return { usedDemo: true, demoReason: "模型服务不可用", questions: Demo.generateQuestions(payload.draftSections, payload.materials, payload.prefs) };
  }

  async function callAi(action, payload) {
    var settings = Store.loadSettings();
    var useServer = await checkServerKey();
    var clientKey = (settings.apiKey || "").trim();
    var directKey = (typeof window !== "undefined" && window.AI_DIRECT_KEY) || "";
    // 自动解码 base64
    if (directKey && !directKey.startsWith("sk-")) { try { directKey = atob(directKey); } catch(e) {} }

    // 服务端无 Key 且无任何可用 Key → Demo 模式
    if (!useServer && !clientKey && !directKey) {
      return fallbackToDemo(action, payload);
    }

    // 服务端 Key 已知无效且无直连 Key → Demo
    if (serverKeyInvalid && !clientKey && !directKey) {
      return fallbackToDemo(action, payload);
    }

    // 有直连 Key → 优先直连，跳过可能不可用的服务端
    if (directKey && directKey.startsWith("sk-")) {
      try {
        return await callDirectAPI(action, payload, directKey);
      } catch (e2) {
        // 直连失败 → 尝试服务端
      }
    }

    // 真实模式：经服务端代理
    try {
      var res = await fetch(API_BASE + "/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ action: action, apiKey: clientKey, model: settings.model }, payload)),
      });
      var data = await res.json().catch(function () { return null; });

      if (res.status === 401 || res.status === 403) {
        serverKeyInvalid = true; serverHasKey = false;
        return fallbackToDemo(action, payload);
      }
      if (!res.ok && data && data.error && /模型服务错误\s*(401|403)|authentication|api key.*invalid/i.test(data.error)) {
        serverKeyInvalid = true; serverHasKey = false;
        return fallbackToDemo(action, payload);
      }
      if (!res.ok) { throw new Error((data && data.error) || "AI 服务异常，请稍后重试"); }
      serverKeyInvalid = false;
      return data;
    } catch (e) {
      if (e.message && (e.message.indexOf("Failed to fetch") >= 0 || e.message.indexOf("NetworkError") >= 0)) {
        return fallbackToDemo(action, payload);
      }
      throw e;
    }
  }

  async function callDirectAPI(action, payload, apiKey) {
    var base = (typeof window !== "undefined" && window.AI_DIRECT_BASE) || "https://api.deepseek.com";
    var model = (typeof window !== "undefined" && window.AI_DIRECT_MODEL) || "deepseek-chat";
    var systemPrompt, userPrompt;

    if (action === "draft") {
      systemPrompt = "你是资深B端产品经理。根据材料按框架撰写PRD。只输出JSON，格式：{\"name\":\"项目名\",\"sections\":[{\"key\":\"章节key\",\"title\":\"标题\",\"content\":\"正文\"}]}。项目名称必须遵循【业务线】业务分支+改进点格式，如【质检】CS质检平台-UI列表页改版。name章节(key=name)的内容就是项目名称本身一句话，不能写成背景或目标。数据层/后端层/前端层必须完全不同。改进点用列表不要表格。";
      userPrompt = "框架：" + payload.sections.map(function(s){return s.key + "：" + s.title;}).join("\n") + "\n\n材料：" + payload.materials.map(function(m){return m.text;}).join("\n\n");
    } else if (action === "questions") {
      systemPrompt = "你是资深产品经理+开发工程师。基于PRD初稿产出两阶段追问。只输出JSON：{\"questions\":[{\"stage\":1|2,\"sectionKey\":\"key\",\"question\":\"问题\",\"suggestedAnswer\":\"可填入PRD的参考答案\",\"actionGuidance\":\"告诉用户补充什么方向\",\"priority\":\"P0|P1|P2\",\"impact\":\"不填写的风险\",\"dataLayer\":true|false}]}。阶段一检查框架覆盖，阶段二开发视角审查，数据层必问。至少6条。";
      userPrompt = "章节：" + payload.sections.map(function(s){return s.key + "：" + s.title;}).join("\n") + "\n\n初稿：" + payload.draftSections.map(function(s){return "## " + s.title + "\n" + s.content;}).join("\n\n") + "\n\n材料：" + payload.materials.map(function(m){return m.text;}).join("\n\n");
    } else if (action === "enhance") {
      systemPrompt = "基于PRD初稿和已有追问，产出新的不重复追问。只输出JSON：{\"questions\":[{\"stage\":2,\"sectionKey\":\"key\",\"question\":\"问题\",\"suggestedAnswer\":\"建议\",\"priority\":\"P0|P1|P2\",\"dataLayer\":true|false}]}";
      userPrompt = "已有追问：" + (payload.existing || []).map(function(q){return q.question;}).join("\n") + "\n\n初稿：" + payload.draftSections.map(function(s){return "## " + s.title + "\n" + s.content;}).join("\n\n");
    } else {
      throw new Error("未知操作：" + action);
    }

    var res = await fetch(base + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + apiKey },
      body: JSON.stringify({ model: model, messages: [{role:"system",content:systemPrompt},{role:"user",content:userPrompt}], temperature: 0.4, max_tokens: 4096 })
    });
    if (!res.ok) {
      var errText = await res.text().catch(function(){return "";});
      throw new Error("API错误 " + res.status + "：" + errText.slice(0,200));
    }
    var wrapper = await res.json();
    var content = (wrapper && wrapper.choices && wrapper.choices[0] && wrapper.choices[0].message && wrapper.choices[0].message.content) || "";
    if (!content.trim()) throw new Error("模型返回为空");

    // 解析JSON
    var parsed;
    try { parsed = JSON.parse(content); } catch(e) {
      var cleaned = content.replace(/```json\s*/g,"").replace(/```\s*/g,"").trim();
      var s = cleaned.indexOf("{"), e2 = cleaned.lastIndexOf("}");
      if (s >= 0 && e2 > s) cleaned = cleaned.slice(s, e2 + 1);
      try { parsed = JSON.parse(cleaned); } catch(e3) { throw new Error("JSON解析失败"); }
    }
    // 给 questions 补上 id（服务端 normalizeQuestions 做的事，直连也需要）
    if (parsed && Array.isArray(parsed.questions)) {
      parsed.questions = parsed.questions.map(function (q, i) {
        if (!q.id) q.id = "q-" + (i + 1);
        if (!q.status) q.status = "pending";
        if (q.answer === undefined) q.answer = "";
        if (!q.actionGuidance) q.actionGuidance = q.suggestedAnswer || "";
        return q;
      });
    }
    return Object.assign({ usedDemo: false }, parsed);
  }

  global.AI = { callAi: callAi, checkServerKey: checkServerKey };
})(window);
