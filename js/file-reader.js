// 浏览器端多格式文件文本提取（零依赖）
// 支持：.txt .md .docx .pdf .pptx
(function (global) {
  "use strict";

  // ---- ZIP 解压（用于 .docx / .pptx） ----

  function unzip(buf) {
    var dv = new DataView(buf);
    var out = {};
    var decoder = new TextDecoder();
    var off = 0;
    while (off + 30 <= buf.byteLength) {
      if (dv.getUint32(off, true) !== 0x04034b50) break;
      var method = dv.getUint16(off + 8, true);
      var compSize = dv.getUint32(off + 18, true);
      var nameLen = dv.getUint16(off + 26, true);
      var extraLen = dv.getUint16(off + 28, true);
      var name = decoder.decode(new Uint8Array(buf, off + 30, nameLen));
      var data = new Uint8Array(buf, off + 30 + nameLen + extraLen, compSize);
      if (method === 0) {
        out[name] = new TextDecoder().decode(data);
      } else if (method === 8) {
        try {
          var ds = new DecompressionStream("deflate-raw");
          var stream = new Blob([data]).stream().pipeThrough(ds);
          out[name] = "(binary)";
          out["_blob_" + name] = data;
        } catch (e) {
          out[name] = "(decompress failed)";
        }
      }
      off += 30 + nameLen + extraLen + compSize;
    }
    return out;
  }

  async function unzipBlob(buf) {
    var dv = new DataView(buf);
    var out = {};
    var decoder = new TextDecoder();
    var off = 0;
    while (off + 30 <= buf.byteLength) {
      if (dv.getUint32(off, true) !== 0x04034b50) break;
      var method = dv.getUint16(off + 8, true);
      var compSize = dv.getUint32(off + 18, true);
      var nameLen = dv.getUint16(off + 26, true);
      var extraLen = dv.getUint16(off + 28, true);
      var name = decoder.decode(new Uint8Array(buf, off + 30, nameLen));
      var data = new Uint8Array(buf, off + 30 + nameLen + extraLen, compSize);
      if (method === 0) {
        out[name] = decoder.decode(data);
      } else if (method === 8) {
        try {
          var ds = new DecompressionStream("deflate-raw");
          var stream = new Blob([data]).stream().pipeThrough(ds);
          var result = await new Response(stream).arrayBuffer();
          out[name] = new TextDecoder().decode(new Uint8Array(result));
        } catch (e) {
          out[name] = "";
        }
      }
      off += 30 + nameLen + extraLen + compSize;
    }
    return out;
  }

  // ---- .docx 文本提取 ----

  async function extractDocxText(file) {
    var buf = await file.arrayBuffer();
    var entries = await unzipBlob(buf);
    var docXml = entries["word/document.xml"];
    if (!docXml) throw new Error("未在 docx 中找到 document.xml");
    // 从 <w:t> 标签提取文本，<w:p> 之间插入换行
    var text = docXml
      .replace(/<w:p[ >]/g, "\n<w:p>")
      .replace(/<w:p[\s\S]*?<\/w:p>/g, function (match) {
        var ts = [];
        var re = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
        var m;
        while ((m = re.exec(match))) ts.push(m[1]);
        return ts.join("") + "\n";
      })
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) throw new Error("docx 文本内容为空");
    return text;
  }

  // ---- .pdf 基础文本提取（零依赖，处理简单 PDF） ----

  async function extractPdfText(file) {
    var buf = await file.arrayBuffer();
    var text = "";
    var data = new Uint8Array(buf);
    var str = "";
    // 将二进制转为 Latin-1 字符串（保持字节值）
    for (var i = 0; i < data.length; i++) {
      str += String.fromCharCode(data[i]);
    }

    // 解压所有 FlateDecode 流
    var streams = {};
    var streamRe = /(\d+ \d+ obj[\s\S]*?endobj)/g;
    var streamMatch;
    while ((streamMatch = streamRe.exec(str))) {
      var obj = streamMatch[1];
      var filterMatch = obj.match(/\/Filter\s*\/FlateDecode/);
      if (!filterMatch) continue;
      var lengthMatch = obj.match(/\/Length\s+(\d+)/);
      if (!lengthMatch) continue;
      var streamStart = obj.indexOf("stream") + 6;
      if (streamStart < 6) continue;
      // 跳过 \r\n 或 \n
      if (str.charCodeAt(streamStart) === 13) streamStart++;
      if (str.charCodeAt(streamStart) === 10) streamStart++;
      var streamEnd = obj.indexOf("endstream", streamStart);
      if (streamEnd < 0) continue;
      var compressed = new Uint8Array(data.slice(streamStart, streamEnd));
      try {
        var ds = new DecompressionStream("deflate-raw");
        var result = await new Response(new Blob([compressed]).stream().pipeThrough(ds)).arrayBuffer();
        var decText = new TextDecoder().decode(new Uint8Array(result));
        // 从解压后的文本中提取 BT...ET 文本块
        var btRe = /BT([\s\S]*?)ET/g;
        var btMatch;
        while ((btMatch = btRe.exec(decText))) {
          var block = btMatch[1];
          // 提取 Tj 操作符的文本
          var tjRe = /\(([^)]*)\)\s*Tj/g;
          var tjMatch;
          while ((tjMatch = tjRe.exec(block))) {
            text += tjMatch[1];
          }
          // 提取 TJ 数组
          var tjArrRe = /\[([\s\S]*?)\]\s*TJ/g;
          var tjArrMatch;
          while ((tjArrMatch = tjArrRe.exec(block))) {
            var arr = tjArrMatch[1];
            var arrRe = /\(([^)]*)\)/g;
            var arrMatch;
            while ((arrMatch = arrRe.exec(arr))) {
              text += arrMatch[1];
            }
          }
        }
      } catch (e) {
        // 解压失败，跳过这个流
      }
    }

    // 如果从流中没有提取到文本，尝试从原始 PDF 文本中提取
    if (!text.trim()) {
      var btRe2 = /BT([\s\S]*?)ET/g;
      var btMatch2;
      while ((btMatch2 = btRe2.exec(str))) {
        var block2 = btMatch2[1];
        var tjRe2 = /\(([^)]*)\)\s*Tj/g;
        var tjMatch2;
        while ((tjMatch2 = tjRe2.exec(block2))) {
          text += tjMatch2[1];
        }
      }
    }

    if (!text.trim()) throw new Error("PDF 文本提取失败（可能是扫描件或加密PDF）");
    return text.replace(/\\([\\(\\)])/g, "$1").replace(/\s{3,}/g, "\n").trim();
  }

  // ---- 调度器：根据文件类型提取文本 ----

  async function extractFileText(file) {
    var name = (file.name || "unknown").toLowerCase();
    var type = file.type || "";

    if (name.endsWith(".txt") || type === "text/plain") {
      return await file.text();
    }
    if (name.endsWith(".md") || name.endsWith(".markdown") || type === "text/markdown") {
      return await file.text();
    }
    if (name.endsWith(".pptx") || type.indexOf("presentation") >= 0) {
      if (typeof Pptx !== "undefined" && Pptx.extractPptxText) {
        return await Pptx.extractPptxText(file);
      }
      throw new Error("PPTX 提取模块未加载");
    }
    if (name.endsWith(".docx") || type.indexOf("word") >= 0 || type.indexOf("officedocument") >= 0) {
      return await extractDocxText(file);
    }
    if (name.endsWith(".pdf") || type === "application/pdf") {
      return await extractPdfText(file);
    }
    if (name.endsWith(".doc") || type === "application/msword") {
      // .doc 是旧格式，无法在浏览器端提取，提示用户
      throw new Error("暂不支持旧版 .doc 格式，请转换为 .docx 后重试");
    }

    // 兜底：尝试当文本读取
    try {
      return await file.text();
    } catch (e) {
      throw new Error("不支持的的文件格式：" + (name || "未知"));
    }
  }

  function fileTypeLabel(file) {
    var name = (file.name || "").toLowerCase();
    if (name.endsWith(".txt")) return "txt";
    if (name.endsWith(".md")) return "md";
    if (name.endsWith(".pptx")) return "pptx";
    if (name.endsWith(".docx")) return "docx";
    if (name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".doc")) return "doc";
    return "file";
  }

  global.FileReader_util = {
    extractFileText: extractFileText,
    fileTypeLabel: fileTypeLabel,
  };
})(window);
