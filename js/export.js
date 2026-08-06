(function (global) {
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function projectToMarkdown(project) {
    var lines = [];
    lines.push("# " + project.name);
    lines.push("");
    lines.push("> 由 PRD Studio 整理 · " + fmtTime(project.updatedAt || Date.now()));
    var meta = [];
    if (project.businessLine && project.businessLine.length) meta.push("业务线：" + project.businessLine.join(" / "));
    if (project.dept && project.dept.length) meta.push("协作部门：" + project.dept.join(" / "));
    if (project.priority) meta.push("优先级：" + project.priority);
    if (project.tags && project.tags.length) meta.push("标签：" + project.tags.join(" / "));
    if (meta.length) {
      lines.push("> " + meta.join("　"));
      lines.push("");
    }
    lines.push("");
    project.sections.forEach(function (s) {
      lines.push("## " + s.title);
      lines.push("");
      lines.push(htmlToMarkdown(s.content || "").trim() || "（待填写）");
      lines.push("");
    });
    return lines.join("\n");
  }

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

  // 富文本 HTML → Markdown（用于导出 .md）
  function htmlToMarkdown(html) {
    if (!isHtml(html)) return String(html || "");
    var doc = new DOMParser().parseFromString(html, "text/html");
    function walk(node) {
      if (node.nodeType === 3) return node.textContent || "";
      if (node.nodeType !== 1) return "";
      var tag = node.tagName.toLowerCase();
      var inner = Array.prototype.map.call(node.childNodes, walk).join("");
      switch (tag) {
        case "b": case "strong": return "**" + inner + "**";
        case "i": case "em": return "*" + inner + "*";
        case "u": return "__" + inner + "__";
        case "h1": return "# " + inner + "\n";
        case "h2": return "## " + inner + "\n";
        case "h3": return "### " + inner + "\n";
        case "li": return "- " + inner + "\n";
        case "br": return "\n";
        case "p": case "div": return inner + "\n";
        case "tr":
          return "| " + Array.prototype.map.call(node.children, function (c) { return (c.textContent || "").trim(); }).join(" | ") + " |\n";
        case "table": return "\n" + inner + "\n";
        case "img": return node.getAttribute("alt") ? "![" + node.getAttribute("alt") + "](" + (node.getAttribute("src") || "") + ")" : "";
        case "font": return inner;
        default: return inner;
      }
    }
    return walk(doc.body).replace(/\n{3,}/g, "\n\n").trim();
  }

  function renderContent(text) {
    var t = text || "";
    return isHtml(t) ? t : markdownToHtml(t || "（待填写）");
  }

  function exportHtml(project) {
    var parts = [];
    parts.push("<!DOCTYPE html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>" + escHtml(project.name) + "</title>");
    parts.push("<style>body{font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1a1a1a;max-width:820px;margin:24px auto;padding:0 20px;line-height:1.7}h1{font-size:22px;border-bottom:2px solid #c8ff3d;padding-bottom:8px}h2{font-size:16px;margin-top:26px;border-left:4px solid #c8ff3d;padding-left:8px}p{margin:6px 0}li{margin:3px 0}pre{background:#f6f7f5;padding:8px 10px;border-radius:6px;overflow-x:auto;font-size:12.5px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}img{max-width:100%;height:auto;border-radius:6px}</style></head><body>");
    parts.push("<h1>" + escHtml(project.name) + "</h1>");
    project.sections.forEach(function (s) {
      parts.push("<h2>" + escHtml(s.title) + "</h2>");
      parts.push(renderContent(s.content));
    });
    parts.push("</body></html>");
    return parts.join("\n");
  }

  global.Export = { projectToMarkdown: projectToMarkdown, exportHtml: exportHtml, renderContent: renderContent };
})(window);
