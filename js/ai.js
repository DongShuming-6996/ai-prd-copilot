(function (global) {
  var serverHasKey = null; // null=未知，true/false=服务端是否配置了 Key
  var API_BASE = (typeof window !== "undefined" && window.AI_API_BASE) || "";
  var serverKeyInvalid = false; // 服务端 Key 被判定为无效（401/403）

  async function checkServerKey() {
    if (serverHasKey !== null) return serverHasKey;
    try {
      var res = await fetch(API_BASE + "/api/status", { method: "GET" });
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

    // 服务端无 Key 且本地也未填 Key → Demo 模式
    if (!useServer && !clientKey) {
      return fallbackToDemo(action, payload);
    }

    // 服务端 Key 已知无效 → 直接 Demo
    if (serverKeyInvalid && !clientKey) {
      return fallbackToDemo(action, payload);
    }

    // 真实模式：经服务端代理到模型服务
    try {
      var res = await fetch(API_BASE + "/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({ action: action, apiKey: clientKey, model: settings.model }, payload)),
      });
      var data = await res.json().catch(function () { return null; });

      // 401/403 — Key 无效
      if (res.status === 401 || res.status === 403) {
        serverKeyInvalid = true;
        serverHasKey = false;
        return fallbackToDemo(action, payload);
      }

      // 500 但错误内容包含 401/403 认证失败 — Key 无效（兼容旧版服务端）
      if (!res.ok && data && data.error && /模型服务错误\s*(401|403)|authentication|api key.*invalid/i.test(data.error)) {
        serverKeyInvalid = true;
        serverHasKey = false;
        return fallbackToDemo(action, payload);
      }

      if (!res.ok) {
        throw new Error((data && data.error) || "AI 服务异常，请稍后重试");
      }
      // 成功后重置无效标记（Key 可能被修复）
      serverKeyInvalid = false;
      return data;
    } catch (e) {
      // 网络错误也降级
      if (e.message && (e.message.indexOf("Failed to fetch") >= 0 || e.message.indexOf("NetworkError") >= 0)) {
        return fallbackToDemo(action, payload);
      }
      throw e;
    }
  }

  global.AI = { callAi: callAi, checkServerKey: checkServerKey };
})(window);
