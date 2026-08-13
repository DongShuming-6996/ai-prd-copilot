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

  // Word 兼容导出：带完整 Office 命名空间，Word 打开不报格式错误
  function exportWordHtml(project) {
    var inner = exportHtml(project);
    var body = inner.replace(/^[\s\S]*?<body>/, "").replace(/<\/body>[\s\S]*$/, "");
    return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="Microsoft Word 15"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->' +
      '<style>@page{size:A4;margin:2cm}body{font-family:-apple-system,\'PingFang SC\',\'Microsoft YaHei\',sans-serif;color:#1a1a1a;line-height:1.7}h1{font-size:22px;border-bottom:2px solid #c8ff3d;padding-bottom:8px}h2{font-size:16px;margin-top:26px;border-left:4px solid #c8ff3d;padding-left:8px}p{margin:6px 0}li{margin:3px 0}pre{background:#f6f7f5;padding:8px 10px;border-radius:6px;overflow-x:auto;font-size:12.5px}table{border-collapse:collapse;width:100%;margin:8px 0;font-size:12.5px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}img{max-width:100%;height:auto;border-radius:6px}</style></head><body>' +
      body + '</body></html>';
  }

  // 富文本 HTML → 纯文本（保留段落换行，用于 PDF 绘制）
  function htmlToText(html) {
    if (!isHtml(html)) return String(html || "");
    var doc = new DOMParser().parseFromString(html, "text/html");
    var out = [];
    function walk(node) {
      if (node.nodeType === 3) { out.push(node.textContent || ""); return; }
      if (node.nodeType !== 1) return;
      var tag = node.tagName.toLowerCase();
      if (tag === "br") out.push("\n");
      else if (tag === "p" || tag === "div" || tag === "li" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "tr") {
        Array.prototype.forEach.call(node.childNodes, walk);
        out.push("\n");
      } else {
        Array.prototype.forEach.call(node.childNodes, walk);
      }
    }
    walk(doc.body);
    return out.join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  function strToBytes(str) {
    var bytes = new Uint8Array(str.length);
    for (var i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i) & 0xff;
    return bytes;
  }
  function concatBytes(arrays) {
    var total = 0;
    for (var i = 0; i < arrays.length; i++) total += arrays[i].length;
    var out = new Uint8Array(total);
    var off = 0;
    for (var j = 0; j < arrays.length; j++) { out.set(arrays[j], off); off += arrays[j].length; }
    return out;
  }
  function dataUrlToBytes(dataUrl) {
    var b64 = dataUrl.split(",")[1];
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  // 生成 PDF：Canvas 分页渲染为 JPEG，再组装成多页 PDF（直接下载，非打印）
  function buildPdfBlob(project) {
    var lines = [];
    lines.push({ text: project.name, size: 22, bold: true });
    var meta = [];
    if (project.businessLine && project.businessLine.length) meta.push("业务线：" + project.businessLine.join(" / "));
    if (project.dept && project.dept.length) meta.push("协作部门：" + project.dept.join(" / "));
    if (project.priority) meta.push("优先级：" + project.priority);
    if (project.tags && project.tags.length) meta.push("标签：" + project.tags.join(" / "));
    if (meta.length) lines.push({ text: meta.join("　"), size: 12, color: "#666666" });
    lines.push({ text: " ", size: 13 });
    project.sections.forEach(function (s) {
      lines.push({ text: s.title, size: 16, bold: true });
      htmlToText(s.content).split("\n").forEach(function (l) {
        var t = l.trim();
        if (t) lines.push({ text: t, size: 13 });
      });
      lines.push({ text: " ", size: 13 });
    });

    var W = 794, H = 1123, margin = 64;
    var canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext("2d");
    var pages = [];
    function newPage() {
      pages.push(canvas.toDataURL("image/jpeg", 0.92));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, W, H);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    var y = margin;
    var maxWidth = W - margin * 2;
    lines.forEach(function (line) {
      ctx.font = (line.bold ? "bold " : "") + line.size + "px -apple-system,'PingFang SC','Microsoft YaHei',sans-serif";
      ctx.fillStyle = line.color || "#1a1a1a";
      var lineH = Math.round(line.size * 1.9);
      var chunks = [];
      var cur = "";
      var text = line.text;
      for (var i = 0; i < text.length; i++) {
        var test = cur + text[i];
        if (ctx.measureText(test).width > maxWidth && cur) { chunks.push(cur); cur = text[i]; }
        else cur = test;
      }
      if (cur) chunks.push(cur);
      chunks.forEach(function (chunk) {
        if (y + lineH > H - margin) { newPage(); y = margin; }
        ctx.fillText(chunk, margin, y + line.size);
        y += lineH;
      });
    });
    pages.push(canvas.toDataURL("image/jpeg", 0.92));

    return assemblePdf(pages, W, H);
  }

  function assemblePdf(pages, W, H) {
    var n = pages.length;
    var objs = {};
    // 对象编号：1=Catalog, 2=Pages；每页 i: page=3+i*3, image=4+i*3, content=5+i*3
    for (var i = 0; i < n; i++) {
      var jpeg = dataUrlToBytes(pages[i]);
      var imgNum = 4 + i * 3;
      objs[imgNum] = concatBytes([
        strToBytes("<< /Type /XObject /Subtype /Image /Width " + W + " /Height " + H + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>\nstream\n"),
        jpeg,
        strToBytes("\nendstream")
      ]);
    }
    for (var j = 0; j < n; j++) {
      var imgN = 4 + j * 3, contentN = 5 + j * 3;
      var stream = "q\n595 0 0 842 0 0 cm\n/Im" + j + " Do\nQ\n";
      objs[contentN] = concatBytes([strToBytes("<< /Length " + stream.length + " >>\nstream\n"), strToBytes(stream), strToBytes("endstream")]);
    }
    for (var k = 0; k < n; k++) {
      var pageN = 3 + k * 3, imgN2 = 4 + k * 3, contentN2 = 5 + k * 3;
      objs[pageN] = strToBytes("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im" + k + " " + imgN2 + " 0 R >> >> /Contents " + contentN2 + " 0 R >>");
    }
    var kids = [];
    for (var m = 0; m < n; m++) kids.push((3 + m * 3) + " 0 R");
    objs[2] = strToBytes("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + n + " >>");
    objs[1] = strToBytes("<< /Type /Catalog /Pages 2 0 R >>");

    var total = 2 + 3 * n;
    var out = [strToBytes("%PDF-1.4\n")];
    var xref = {};
    var pos = out[0].length;
    for (var o = 1; o <= total; o++) {
      xref[o] = pos;
      var objBytes = concatBytes([strToBytes(o + " 0 obj\n"), objs[o], strToBytes("\nendobj\n")]);
      out.push(objBytes);
      pos += objBytes.length;
    }
    var xrefPos = pos;
    var xrefStr = "xref\n0 " + (total + 1) + "\n0000000000 65535 f \n";
    for (var p2 = 1; p2 <= total; p2++) xrefStr += ("0000000000" + xref[p2]).slice(-10) + " 00000 n \n";
    xrefStr += "trailer\n<< /Size " + (total + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefPos + "\n%%EOF";
    out.push(strToBytes(xrefStr));

    return new Blob([concatBytes(out)], { type: "application/pdf" });
  }

  global.Export = { projectToMarkdown: projectToMarkdown, exportHtml: exportHtml, exportWordHtml: exportWordHtml, buildPdfBlob: buildPdfBlob, renderContent: renderContent };
})(window);
