(function (global) {
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function mdLineToHtml(line) {
    var t = escHtml(line);
    t = t.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (/^#{2,3}\s/.test(t)) return "<h2>" + t.replace(/^#{2,3}\s/, "") + "</h2>";
    if (/^#{1}\s/.test(t)) return "<h1>" + t.replace(/^#\s/, "") + "</h1>";
    if (/^\s*[-•*]\s+/.test(t)) return "<li>" + t.replace(/^\s*[-•*]\s+/, "") + "</li>";
    if (/^\s*\|/.test(t)) return "<pre>" + t + "</pre>";
    if (!t.trim()) return "";
    return "<p>" + t + "</p>";
  }

  function markdownToHtml(text) {
    return String(text || "")
      .split("\n")
      .map(mdLineToHtml)
      .join("\n");
  }

  function isHtml(text) {
    return /<[a-z][\s\S]*>/i.test(String(text || "").trim());
  }

  function renderContent(text) {
    var t = text || "";
    return isHtml(t) ? t : markdownToHtml(t || "（待填写）");
  }

  // 仅保留页面展示所需的渲染函数（预览页 / 详情页 / 编辑页回显共用）
  global.Export = { renderContent: renderContent };
})(window);
