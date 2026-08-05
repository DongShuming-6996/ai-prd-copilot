(function (global) {
  async function unzip(buf) {
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
        out[name] = data;
      } else if (method === 8) {
        var ds = new DecompressionStream("deflate-raw");
        var stream = new Blob([data]).stream().pipeThrough(ds);
        var result = await new Response(stream).arrayBuffer();
        out[name] = new Uint8Array(result);
      }
      off += 30 + nameLen + extraLen + compSize;
    }
    return out;
  }

  async function extractPptxText(file) {
    var buf = await file.arrayBuffer();
    var zip = await unzip(buf);
    var names = Object.keys(zip)
      .filter(function (k) { return /^ppt\/slides\/slide\d+\.xml$/.test(k); })
      .sort(function (a, b) {
        var na = Number((a.match(/(\d+)/) || [0, 0])[1]);
        var nb = Number((b.match(/(\d+)/) || [0, 0])[1]);
        return na - nb;
      });
    if (!names.length) throw new Error("未在 PPT 中找到幻灯片文本");
    var parts = [];
    for (var i = 0; i < names.length; i++) {
      var xml = new TextDecoder().decode(zip[names[i]]);
      var doc = new DOMParser().parseFromString(xml, "application/xml");
      var runs = Array.from(doc.getElementsByTagName("a:t")).map(function (n) { return n.textContent || ""; }).join("");
      parts.push("【" + names[i].replace(/^ppt\/slides\/|\..+$/g, "") + "】" + runs);
    }
    return parts.join("\n");
  }

  global.Pptx = { extractPptxText: extractPptxText };
})(window);
