(function (global) {
  var serverHasKey = null; // null=未知，true/false=服务端是否配置了 Key

  async function checkServerKey() {
    if (serverHasKey !== null) return serverHasKey;
    try {
      var res = await fetch("/api/status", { method: "GET" });
      var data = await res.json();
      serverHasKey = !!(data && data.hasEnvKey);
    } catch (e) {
      serverHasKey = false;
    }
    return serverHasKey;
  }

  async function callAi(action, payload) {
    var settings = Store.loadSettings();
    var useServer = await checkServerKey();
    var clientKey = (settings.apiKey || "").trim();

    // 服务端无 Key 且本地也未填 Key → Demo 模式（纯浏览器端生成）
    if (!useServer && !clientKey) {
      if (action === "draft") {
        return Object.assign({ usedDemo: true }, Demo.generateDraft(payload.materials, payload.sections, payload.crossDept));
      }
      if (action === "enhance") {
        return { usedDemo: true, questions: Demo.generateEnhance(payload.existing, payload.draftSections, payload.materials) };
      }
      return { usedDemo: true, questions: Demo.generateQuestions(payload.draftSections, payload.materials, payload.prefs) };
    }

    // 真实模式：经服务端代理到模型服务（Key 由服务端持有，浏览器不保存）
    var res = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ action: action, apiKey: clientKey, model: settings.model }, payload)),
    });
    var data = await res.json().catch(function () { return null; });
    if (!res.ok) {
      throw new Error((data && data.error) || "AI 服务异常，请稍后重试");
    }
    return data;
  }

  global.AI = { callAi: callAi, checkServerKey: checkServerKey };
})(window);
