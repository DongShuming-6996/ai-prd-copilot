(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
  }

  function topLevelCount(sections) {
    var set = {};
    (sections || []).forEach(function (s) {
      var m = String(s.title || "").match(/^\s*(\d+)/);
      if (m) set[m[1]] = true;
    });
    var n = Object.keys(set).length;
    return n || (sections ? sections.length : 0);
  }

  function parseHash() {
    var h = location.hash || "#/";
    var m;
    if ((m = h.match(/^#\/new(?:\?id=([^/]*))?$/))) return { page: "new", id: m[1] ? decodeURIComponent(m[1]) : null };
    if ((m = h.match(/^#\/edit\/([^?/]+)(\?mode=editor)?$/))) return { page: "edit", id: decodeURIComponent(m[1]), mode: m[2] ? "editor" : "material" };
    if ((m = h.match(/^#\/preview\/([^/]+)$/))) return { page: "preview", id: decodeURIComponent(m[1]) };
    if ((m = h.match(/^#\/project\/([^/]+)$/))) return { page: "project", id: decodeURIComponent(m[1]) };
    if ((m = h.match(/^#\/questions\/([^/]+)$/))) return { page: "questions", id: decodeURIComponent(m[1]) };
    return { page: "list" };
  }

  function chipHTML(list, selected, dim) {
    return list.map(function (item) {
      var v = Array.isArray(item) ? item[0] : item;
      var label = Array.isArray(item) ? item[1] : item;
      var on = selected.indexOf(v) >= 0;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-dim="' + dim + '" data-val="' + esc(v) + '">' + esc(label) + "</button>";
    }).join("");
  }

  var STATUS_TEXT = { draft: "草稿", editing: "编辑中", done: "已完成" };
  var DICTS = Templates.DICTS;
  var PRESET_TAGS = Templates.PRESET_TAGS;

  function isSelIn(area) {
    var sel = window.getSelection();
    return !!(sel && sel.rangeCount && area.contains(sel.getRangeAt(0).commonAncestorContainer));
  }

  function insertHtmlAtCaret(area, html) {
    var sel = window.getSelection();
    var range;
    if (isSelIn(area)) {
      range = sel.getRangeAt(0);
      range.deleteContents();
    } else {
      area.focus();
      range = document.createRange();
      range.selectNodeContents(area);
      range.collapse(false);
    }
    var frag = range.createContextualFragment(html);
    var last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    area.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function pickImageFor(area) {
    var input = document.getElementById("rte-img-input");
    if (!input) return;
    input.onchange = function () {
      var file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) {
        window.alert("图片超过 2MB，请压缩后重新插入");
        input.value = "";
        return;
      }
      // 插入前自动压缩（转 JPEG，兼容 Word/PDF 导出；画质优先）
      compressImageFile(file, 1280, 0.82, function (out) {
        var reader = new FileReader();
        reader.onload = function () {
          insertHtmlAtCaret(area, '<img src="' + reader.result + '" alt="图片" loading="lazy" decoding="async" style="max-width:100%;border-radius:6px">');
        };
        reader.readAsDataURL(out);
      }, true);
      input.value = "";
    };
    input.click();
  }

  // 图片压缩：等比缩到 maxDim 内，优先 WebP（附件）或 JPEG（富文本/导出兼容），
  // 压缩后不小于原图则保留原图（透明 PNG 走 WebP/PNG，不填白底）。
  function compressImageFile(file, maxDim, quality, done, preferJpeg) {
    if (!file || (file.type || "").indexOf("image/") !== 0) { done(file); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        if (!w || !h) { done(file); return; }
        var scale = Math.min(1, maxDim / Math.max(w, h));
        var canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        var ctx = canvas.getContext("2d");
        var isPng = file.type === "image/png" && !preferJpeg;
        if (!isPng) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var encoders = preferJpeg ? ["image/jpeg"] : (isPng ? ["image/webp", "image/png"] : ["image/webp", "image/jpeg"]);
        var i = 0;
        var attempt = function () {
          if (i >= encoders.length || typeof canvas.toBlob !== "function") { done(file); return; }
          var mime = encoders[i++];
          try {
            canvas.toBlob(function (blob) {
              if (blob && blob.size > 0 && blob.size < file.size) done(blob);
              else attempt();
            }, mime, quality);
          } catch (e) { attempt(); }
        };
        attempt();
      };
      img.onerror = function () { done(file); };
      img.src = reader.result;
    };
    reader.onerror = function () { done(file); };
    reader.readAsDataURL(file);
  }

  function lazyImg(html) {
    return String(html || "").replace(/<img\s/g, '<img loading="lazy" decoding="async" ');
  }

  function getFilesFromClipboard(e) {
    var files = [];
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return files;
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file") files.push(items[i].getAsFile());
    }
    return files;
  }

  var App = {
    state: {
      form: { id: null, name: "", businessLine: [], dept: [], priority: "", tags: [], selectedSections: [], newSecTitle: "", newSecDesc: "" },
      filters: { time: "all", business: [], dept: [], priority: [], status: [], tags: [], keyword: "", fill: "all" },
      project: null,
    },

    init: function () {
      var self = this;
      window.addEventListener("hashchange", function () { self.route(); });
      this.route();
      this.wireExit();
      this.wireKeyBtn();
      // 加载用户保存的 Key
      try { var savedKey = localStorage.getItem("prd_studio_user_key"); if (savedKey) window.AI_DIRECT_KEY = savedKey; } catch(e) {}
      this.showSplash();
      this.migrateImages();
      this.updateModeBadge();
      // 点击编辑页导出菜单外部时收起菜单
      document.addEventListener("click", function (e) {
        var menu = document.getElementById("fb-export");
        if (menu && !menu.contains(e.target)) {
          var items = document.getElementById("fb-export-items");
          if (items) items.style.display = "none";
        }
      });
    },

    wireKeyBtn: function () {
      var self = this;
      var btn = document.getElementById("btn-key");
      if (!btn) return;
      btn.addEventListener("click", function () {
        var currentKey = window.AI_DIRECT_KEY || "";
        var root = document.getElementById("modal-root");
        root.innerHTML =
          '<div class="modal-mask" id="key-modal-mask"><div class="modal" style="max-width:440px">' +
          '<h3>设置 AI Key</h3>' +
          '<p style="font-size:12px;color:var(--muted);margin:8px 0">输入 DeepSeek API Key，即可使用真实 AI 生成。<br>Key 仅保存在浏览器本地，不会上传。</p>' +
          '<input type="password" id="key-input" placeholder="sk-..." value="' + esc(currentKey) + '" style="width:100%;margin:8px 0">' +
          '<div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px;margin-bottom:0">' +
          '<button class="btn sm" id="key-clear">清除 Key</button>' +
          '<button class="btn sm" id="key-cancel">取消</button>' +
          '<button class="btn sm primary" id="key-save">保存</button></div></div></div>';
        document.body.appendChild(root.firstElementChild);
        document.getElementById("key-save").addEventListener("click", function () {
          var val = document.getElementById("key-input").value.trim();
          window.AI_DIRECT_KEY = val;
          try { localStorage.setItem("prd_studio_user_key", val); } catch(e) {}
          self.updateModeBadge();
          document.getElementById("key-modal-mask").remove();
        });
        document.getElementById("key-cancel").addEventListener("click", function () {
          document.getElementById("key-modal-mask").remove();
        });
        document.getElementById("key-clear").addEventListener("click", function () {
          window.AI_DIRECT_KEY = "";
          try { localStorage.removeItem("prd_studio_user_key"); } catch(e) {}
          self.updateModeBadge();
          document.getElementById("key-modal-mask").remove();
        });
        document.getElementById("key-modal-mask").addEventListener("click", function (e) {
          if (e.target.id === "key-modal-mask") e.target.remove();
        });
      });
    },

    wireExit: function () {
      var btn = document.getElementById("btn-exit");
      if (!btn) return;
      var self = this;
      btn.addEventListener("click", function () {
        if (!window.confirm("确认退出并清除你创建的全部数据？系统模拟的 50 条会保留。")) return;
        Store.clearUserData();
        Promise.resolve(Store.clearAttachments()).then(function () {
          window.alert("已清除你创建的 PRD、自定义章节/标签/业务线/协作部门及附件，系统模拟数据保留。");
          self.route();
        });
      });
    },

    showSplash: function () {
      // 演示版：每次打开/刷新页面都展示开屏说明（访客零配置提示），不做一次性记忆
      var mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.innerHTML =
        '<div class="modal"><h3>欢迎使用 AI PRD Studio</h3>' +
        '<p style="margin:10px 0;color:#cfd6e2;line-height:1.9">AI 驱动的 PRD 撰写与管理工具。粘贴需求材料 → AI 生成初稿 → 两阶段追问澄清 → 富文本兜底完善 → 导出。系统已内置 50 条模拟 PRD 供预览。</p>' +
        '<div class="row" style="justify-content:flex-end;margin-top:16px;margin-bottom:0"><button class="btn primary" id="splash-ok">开始使用</button></div></div>';
      document.body.appendChild(mask);
      var self = this;
      document.getElementById("splash-ok").addEventListener("click", function () {
        document.body.removeChild(mask);
        // 无缝衔接：关掉欢迎弹窗后立即启动新手引导
        if (parseHash().page === "list") {
          self.maybeStartTour();
        }
      });
    },

    // ---------- 新手引导 Tour ----------

    maybeStartTour: function () {
      try {
        if (sessionStorage.getItem("prd_studio_tour_done")) return;
      } catch (e) {}
      var self = this;
      // 等 DOM 完全渲染后再启动（多重保障）
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          setTimeout(function () {
            self.startTour();
          }, 200);
        });
      });
    },

    startTour: function () {
      var self = this;
      this._tourStep = 0;
      this._tourSteps = [
        {
          title: "① 新建 PRD",
          text: "点击这里开始创建你的第一个 PRD。你可以粘贴需求材料，AI 会帮你生成初稿并追问澄清。",
          selector: function () { return document.querySelector('a[href="#/new"].btn.primary') || document.getElementById("nav-new"); },
          arrow: "bottom",
        },
        {
          title: "② 筛选查找",
          text: "系统内置了 50 条模拟 PRD。你可以按业务线、部门、优先级、标签、关键词等维度快速筛选。",
          selector: function () { return document.querySelector(".filter-bar") || document.getElementById("f-keyword"); },
          arrow: "top",
        },
        {
          title: "③ 查看详情",
          text: "点击任意 PRD 名称进入详情页，查看完整内容、附件，或导出 Word / PDF / Markdown。",
          selector: function () { return document.querySelector(".project-card .name") || document.querySelector(".project-card a"); },
          arrow: "top",
        },
        {
          title: "🎉 开始体验吧",
          text: "你已经了解了三个核心入口。现在可以自由探索——试试筛选、新建或查看一条模拟 PRD 吧！",
          selector: function () { return null; },
          arrow: "top",
        },
      ];
      this.renderTourStep();
    },

    renderTourStep: function () {
      var step = this._tourStep;
      var data = this._tourSteps[step];
      if (!data) { this.endTour(); return; }
      var self = this;

      // 清理旧 DOM
      this.endTour(true);

      var target = data.selector ? data.selector() : null;

      // 创建遮罩
      var overlay = document.createElement("div");
      overlay.className = "tour-overlay";
      overlay.id = "tour-overlay";
      document.body.appendChild(overlay);

      // 高亮目标
      if (target) {
        var rect = target.getBoundingClientRect();
        var spot = document.createElement("div");
        spot.className = "tour-spotlight";
        spot.id = "tour-spotlight";
        spot.style.left = (rect.left - 6) + "px";
        spot.style.top = (rect.top - 6) + "px";
        spot.style.width = (rect.width + 12) + "px";
        spot.style.height = (rect.height + 12) + "px";
        document.body.appendChild(spot);
        // 让目标元素透过遮罩可点击（但引导不强制）
        target.style.position = "relative";
        target.style.zIndex = "10001";
      }

      // 创建提示气泡
      var tip = document.createElement("div");
      tip.className = "tour-tip";
      tip.id = "tour-tip";

      // 进度点
      var dots = "";
      for (var i = 0; i < this._tourSteps.length; i++) {
        dots += '<span class="step-dot' + (i === step ? " active" : "") + '"></span>';
      }

      tip.innerHTML =
        '<div style="font-weight:700;font-size:14px;margin-bottom:4px">' + esc(data.title) + "</div>" +
        '<div style="color:#cfd6e2">' + data.text + "</div>" +
        '<div class="tour-progress">' + dots + " " + (step + 1) + " / " + this._tourSteps.length + "</div>" +
        '<div class="btn-row">' +
        (step < this._tourSteps.length - 1
          ? '<button class="btn sm primary" id="tour-next">我知道了</button>'
          : '<button class="btn sm primary" id="tour-finish">开始体验</button>') +
        "</div>";

      document.body.appendChild(tip);

      // 定位气泡
      var tipH = tip.offsetHeight;
      var tipW = tip.offsetWidth;
      if (target) {
        var r = target.getBoundingClientRect();
        var left = Math.max(10, Math.min(r.left + r.width / 2 - tipW / 2, window.innerWidth - tipW - 10));
        var top;
        if (data.arrow === "bottom") {
          top = r.bottom + 14;
          tip.className += " arrow-bottom";
        } else if (data.arrow === "top") {
          top = r.top - tipH - 14;
          tip.className += " arrow-top";
        } else {
          top = r.top + r.height / 2 - tipH / 2;
        }
        top = Math.max(10, Math.min(top, window.innerHeight - tipH - 10));
        tip.style.left = left + "px";
        tip.style.top = top + "px";
      } else {
        // 最后一步居中
        tip.style.left = Math.max(10, (window.innerWidth - tipW) / 2) + "px";
        tip.style.top = Math.max(40, (window.innerHeight - tipH) / 2) + "px";
      }

      // 事件绑定
      var nextBtn = document.getElementById("tour-next");
      var finishBtn = document.getElementById("tour-finish");
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          // 恢复目标 z-index
          if (target) { target.style.position = ""; target.style.zIndex = ""; }
          self._tourStep++;
          self.renderTourStep();
        });
      }
      if (finishBtn) {
        finishBtn.addEventListener("click", function () {
          if (target) { target.style.position = ""; target.style.zIndex = ""; }
          self.endTour();
        });
      }

      // 点击遮罩也可关闭（最后一步）
      if (step === self._tourSteps.length - 1) {
        overlay.addEventListener("click", function () {
          self.endTour();
        });
      }
    },

    endTour: function (silent) {
      silent = silent || false;
      var spot = document.getElementById("tour-spotlight");
      var tip = document.getElementById("tour-tip");
      var overlay = document.getElementById("tour-overlay");
      if (spot) document.body.removeChild(spot);
      if (tip) document.body.removeChild(tip);
      if (overlay) document.body.removeChild(overlay);
      if (!silent) {
        try { sessionStorage.setItem("prd_studio_tour_done", "1"); } catch (e) {}
        // 新手引导结束后，展示创建 PRD 邀请提示
        this.showCreateInvite();
      }
    },

    showCreateInvite: function () {
      var self = this;
      // 检查是否在列表页
      if (parseHash().page !== "list") return;
      // 延迟一点等 tour overlay 完全消失
      setTimeout(function () {
        var existing = document.getElementById("create-invite");
        if (existing) existing.parentElement.removeChild(existing);
        var banner = document.createElement("div");
        banner.id = "create-invite";
        banner.className = "invite-banner";
        banner.innerHTML =
          '<span class="invite-text">👋 准备开始了吗？</span>' +
          '<a href="#/new" class="btn primary sm">创建你的第一个 PRD →</a>' +
          '<span class="invite-hint">点击任意处关闭</span>';
        var app = document.getElementById("app");
        if (app && app.firstChild) {
          app.insertBefore(banner, app.firstChild);
        } else if (app) {
          app.appendChild(banner);
        }
        // 点击任意处关闭
        var dismiss = function (e) {
          if (banner && banner.parentElement) {
            banner.style.opacity = "0";
            banner.style.transform = "translateY(-8px)";
            setTimeout(function () {
              if (banner.parentElement) banner.parentElement.removeChild(banner);
            }, 250);
          }
          document.removeEventListener("click", dismiss);
        };
        // 延迟绑定避免立即触发
        setTimeout(function () {
          document.addEventListener("click", dismiss);
        }, 100);
      }, 300);
    },

    updateModeBadge: function () {
      var badge = document.getElementById("mode-badge");
      if (!badge) return;
      var self = this;
      if (typeof AI !== "undefined" && AI.checkServerKey) {
        AI.checkServerKey().then(function (has) {
          badge.textContent = has ? "DeepSeek 模式" : "Demo 模式";
          badge.className = "demo-badge" + (has ? " live" : "");
        }).catch(function () {
          badge.textContent = "Demo 模式";
          badge.className = "demo-badge";
        });
      } else {
        badge.textContent = "Demo 模式";
        badge.className = "demo-badge";
      }
    },

    route: function () {
      this.updateNav();
      var r = parseHash();
      if (r.page !== "new") {
        this.state.form._key = ""; // 离开新建页后清空表单标记，下次进入重新初始化
      }
      if (r.page === "new") this.renderStep1(r.id);
      else if (r.page === "edit") this.renderStep2(r.id, r.mode);
      else if (r.page === "questions") this.renderQuestionsPage(r.id);
      else if (r.page === "preview") this.renderStep3(r.id);
      else if (r.page === "project") this.renderDetail(r.id);
      else this.renderList();
    },

    updateNav: function () {
      var page = parseHash().page;
      var map = { "nav-home": page === "list", "nav-new": page === "new" };
      ["nav-home", "nav-new"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.className = "nav-item" + (map[id] ? " active" : "");
      });
    },

    setFixedBar: function (html) {
      var bar = document.getElementById("fixed-bar");
      if (!bar) return;
      bar.innerHTML = html;
      document.body.classList.add("has-fixed");
    },

    clearFixedBar: function () {
      var bar = document.getElementById("fixed-bar");
      if (bar) bar.innerHTML = "";
      document.body.classList.remove("has-fixed");
    },

    filled: function (p) {
      return p.sections.filter(function (s) { return (s.content || "").trim(); }).length;
    },

    // ---------- 1. PRD 列表页（含筛选） ----------

    renderList: function () {
      var self = this;
      this.clearFixedBar();
      this.state.projects = Store.loadProjects();
      var f = this.state.filters;

      var tagSet = {};
      this.state.projects.forEach(function (p) { (p.tags || []).forEach(function (t) { tagSet[t] = true; }); });
      PRESET_TAGS.forEach(function (t) { tagSet[t] = true; });
      var tagList = Object.keys(tagSet);
      var busSet = {};
      var deptSet = {};
      DICTS.businessLines.forEach(function (b) { busSet[b] = true; });
      DICTS.depts.forEach(function (d) { deptSet[d] = true; });
      Store.loadCustomBusiness().forEach(function (b) { busSet[b] = true; });
      Store.loadCustomDept().forEach(function (d) { deptSet[d] = true; });
      this.state.projects.forEach(function (p) {
        (p.businessLine || []).forEach(function (b) { busSet[b] = true; });
        (p.dept || []).forEach(function (d) { deptSet[d] = true; });
      });
      var busList = Object.keys(busSet);
      var deptList = Object.keys(deptSet);

      var html = '<h1 class="page-title">我的 PRD</h1>';
      html += '<div class="card filter-bar">';
      html += '<div class="row" style="margin-bottom:10px"><input type="text" id="f-keyword" placeholder="搜索名称 / 内容 / 标签…" value="' + esc(f.keyword) + '" style="flex:1">';
      html += '<button class="btn sm" id="f-clear">清除筛选</button></div>';
      html += '<div class="row"><span class="flabel">时间</span><div class="chips" id="f-time">' + chipHTML([["all", "全部"], ["7", "近7天"], ["30", "近30天"], ["90", "近90天"]], [f.time], "time") + "</div></div>";
      html += '<div class="row"><span class="flabel">业务线</span><div class="chips" id="f-business">' + chipHTML(busList, f.business, "business") + "</div></div>";
      html += '<div class="row"><span class="flabel">协作部门</span><div class="chips" id="f-dept">' + chipHTML(deptList, f.dept, "dept") + "</div></div>";
      html += '<div class="row"><span class="flabel">优先级</span><div class="chips" id="f-priority">' + chipHTML(DICTS.priorities, f.priority, "priority") + "</div></div>";
      html += '<div class="row"><span class="flabel">状态</span><div class="chips" id="f-status">' + chipHTML(Object.keys(STATUS_TEXT), f.status, "status") + "</div></div>";
      html += '<div class="row"><span class="flabel">标签</span><div class="chips" id="f-tags">' + chipHTML(tagList, f.tags, "tags") + "</div>";
      html += '<select id="f-fill" style="width:auto"><option value="all"' + (f.fill === "all" ? " selected" : "") + ">完成度：全部</option><option value=\"done\"" + (f.fill === "done" ? " selected" : "") + ">已填完</option><option value=\"todo\"" + (f.fill === "todo" ? " selected" : "") + ">有未填</option></select></div>";
      html += "</div>";
      html += '<div class="row" style="justify-content:space-between; margin:14px 0"><span class="muted" style="font-size:12.5px" id="f-count"></span><a href="#/new" class="btn primary">+ 新建 PRD</a></div>';
      html += '<div id="list-body"></div>';
      document.getElementById("app").innerHTML = html;

      document.getElementById("f-keyword").addEventListener("input", function (e) {
        f.keyword = e.target.value;
        self.renderListItems();
      });
      document.getElementById("f-clear").addEventListener("click", function () {
        self.state.filters = { time: "all", business: [], dept: [], priority: [], status: [], tags: [], keyword: "", fill: "all" };
        self.renderList();
      });
      document.getElementById("f-fill").addEventListener("change", function (e) {
        f.fill = e.target.value;
        self.renderListItems();
      });
      ["f-time", "f-business", "f-dept", "f-priority", "f-status", "f-tags"].forEach(function (cid) {
        var el = document.getElementById(cid);
        if (!el) return;
        el.addEventListener("click", function (e) {
          var b = e.target.closest(".chip");
          if (!b) return;
          var dim = b.getAttribute("data-dim");
          var val = b.getAttribute("data-val");
          if (dim === "time") {
            f.time = val;
          } else {
            var arr = f[dim];
            var i = arr.indexOf(val);
            if (i < 0) arr.push(val); else arr.splice(i, 1);
          }
          self.renderList();
        });
      });
      this.renderListItems();
    },

    matches: function (p) {
      var f = this.state.filters;
      if (f.business.length && !f.business.some(function (b) { return p.businessLine.indexOf(b) >= 0; })) return false;
      if (f.dept.length && !f.dept.some(function (d) { return p.dept.indexOf(d) >= 0; })) return false;
      if (f.priority.length && f.priority.indexOf(p.priority) < 0) return false;
      if (f.status.length && f.status.indexOf(p.status) < 0) return false;
      if (f.tags.length && !f.tags.some(function (t) { return p.tags.indexOf(t) >= 0; })) return false;
      if (f.time !== "all") {
        var cutoff = Date.now() - Number(f.time) * 864e5;
        if (p.updatedAt < cutoff) return false;
      }
      if (f.fill === "done" && this.filled(p) < p.sections.length) return false;
      if (f.fill === "todo" && this.filled(p) >= p.sections.length) return false;
      if (f.keyword.trim()) {
        var kw = f.keyword.trim().toLowerCase();
        var hay = (p.name + " " + (p.tags || []).join(" ") + " " + p.sections.map(function (s) { return s.content || ""; }).join(" ")).toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    },

    renderListItems: function () {
      var self = this;
      var body = document.getElementById("list-body");
      if (!body) return;
      var list = this.state.projects.filter(function (p) { return self.matches(p); }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
      var countEl = document.getElementById("f-count");
      if (countEl) countEl.textContent = "共 " + list.length + " 个 PRD";
      if (!list.length) {
        body.innerHTML = '<div class="empty">没有符合条件的 PRD，点击右上角「新建 PRD」创建</div>';
        return;
      }
      var html = "";
      list.forEach(function (p) {
        var filled = self.filled(p);
        var tags = (p.tags || []).slice(0, 3);
        html += '<div class="card project-card">';
        html += '<div class="meta"><a href="#/project/' + encodeURIComponent(p.id) + '" class="name">' + esc(p.name) + "</a>";
        html += '<div class="sub">' + fmtTime(p.updatedAt) + " · " + topLevelCount(p.sections) + " 节 · 已填 " + filled + "/" + p.sections.length + "</div>";
        html += '<div class="meta-row" style="margin-top:6px">';
        (p.businessLine || []).slice(0, 2).forEach(function (b) { html += '<span class="tag blue">' + esc(b) + "</span>"; });
        (p.dept || []).slice(0, 2).forEach(function (d) { html += '<span class="tag">' + esc(d) + "</span>"; });
        if (p.priority) html += '<span class="tag ' + (p.priority === "P0" ? "red" : p.priority === "P1" ? "warn" : "") + '">' + esc(p.priority) + "</span>";
        tags.forEach(function (t) { html += '<span class="tag ok">' + esc(t) + "</span>"; });
        if ((p.tags || []).length > 3) html += '<span class="tag">+' + ((p.tags || []).length - 3) + "</span>";
        html += "</div></div>";
        if (p.simulated) html += '<span class="tag blue">系统模拟</span>';
        html += '<span class="tag ' + (p.status === "done" ? "ok" : p.status === "editing" ? "blue" : "") + '">' + (STATUS_TEXT[p.status] || "草稿") + "</span>";
        html += '<a href="#/project/' + encodeURIComponent(p.id) + '" class="btn sm">详情</a>';
        if (!p.simulated) {
          html += '<a href="#/edit/' + encodeURIComponent(p.id) + '?mode=editor" class="btn sm">编辑</a>';
          html += '<button class="btn sm danger" data-del="' + p.id + '">删除</button>';
        }
        html += "</div>";
      });
      body.innerHTML = html;
      document.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (window.confirm("确认删除该项目？该操作不可恢复。")) {
            var p = Store.getProject(btn.getAttribute("data-del"));
            if (p) {
              Promise.all((p.attachments || []).map(function (a) { return Store.attachRemove(a.id).catch(function () {}); })).then(function () {
                Store.deleteProject(p.id);
                self.renderList();
              });
            } else {
              Store.deleteProject(btn.getAttribute("data-del"));
              self.renderList();
            }
          }
        });
      });
    },

    // ---------- 2. 创建向导 Step 1：配置框架 ----------

    renderStep1: function (id) {
      var self = this;
      this.clearFixedBar();
      var defaults = Templates.DEFAULTS[0].sections;
      var customs = Store.loadCustomSections();
      var form = this.state.form;

      if (id) {
        var p = Store.getProject(id);
        if (p) {
          form._key = "p:" + p.id;
          form.id = p.id;
          form.name = p.name;
          form.businessLine = p.businessLine.slice();
          form.dept = p.dept.slice();
          form.priority = p.priority;
          form.tags = p.tags.slice();
          form.selectedSections = p.sections.map(function (x) { return x.key; });
        }
      } else if (form._key !== "new") {
        form._key = "new";
        form.id = null;
        form.name = "";
        form.businessLine = [];
        form.dept = [];
        form.priority = "";
        form.tags = [];
        form.selectedSections = defaults.map(function (s) { return s.key; }).concat(customs.map(function (s) { return s.key; }));
      }

      var tagSet = {};
      Store.loadProjects().forEach(function (x) { (x.tags || []).forEach(function (t) { tagSet[t] = true; }); });
      PRESET_TAGS.forEach(function (t) { tagSet[t] = true; });
      form.tags.forEach(function (t) { tagSet[t] = true; });
      var tagList = Object.keys(tagSet);
      var customBus = Store.loadCustomBusiness();
      var customDept = Store.loadCustomDept();
      var busList = DICTS.businessLines.concat(customBus);
      var deptList = DICTS.depts.concat(customDept);
      form.businessLine.forEach(function (b) { if (busList.indexOf(b) < 0) busList.push(b); });
      form.dept.forEach(function (d) { if (deptList.indexOf(d) < 0) deptList.push(d); });

      var html = '<h1 class="page-title">' + (id ? "配置框架（返回修改）" : "新建 PRD · 第 1 步 / 共 3 步") + "</h1>";
      html += '<div class="card">';
      html += '<div class="edit-title">① 基本信息</div>';
      html += '<div class="row"><span class="flabel">项目名称 *</span><input type="text" id="s-name" placeholder="如：【美团-搜索】酒吧搜词推荐页头图改版" value="' + esc(form.name) + '"></div>';
      html += '<div class="row"><span class="flabel">业务线</span><div class="chips" id="s-business">' + chipHTML(busList, form.businessLine, "businessLine") + "</div>";
      html += '<input type="text" id="s-newbus" placeholder="新增业务线" style="width:130px">';
      html += '<button class="btn sm" id="s-busadd">添加</button></div>';
      html += '<div class="row"><span class="flabel">协作部门</span><div class="chips" id="s-dept">' + chipHTML(deptList, form.dept, "dept") + "</div>";
      html += '<input type="text" id="s-newdept" placeholder="新增部门" style="width:130px">';
      html += '<button class="btn sm" id="s-deptadd">添加</button></div>';
      html += '<div class="row"><span class="flabel">优先级</span><div class="chips" id="s-priority">' + chipHTML(DICTS.priorities, [form.priority], "priority") + "</div></div>";
      html += '<div class="row"><span class="flabel">标签</span><div class="chips" id="s-tags">' + chipHTML(tagList, form.tags, "tags") + "</div>";
      html += '<input type="text" id="s-newtag" placeholder="新增标签" style="width:140px">';
      html += '<button class="btn sm" id="s-tagadd">添加</button></div>';
      html += "</div>";

      html += '<div class="card" style="margin-top:14px">';
      html += '<div class="edit-title">② 框架章节（默认全选）</div>';
      html += '<div style="font-size:12.5px;color:#66707f;margin-bottom:10px">按需勾选要填写的章节，未勾选的不出现在 PRD 中</div>';
      html += '<div class="sec-grid">';
      defaults.forEach(function (sec) {
        var on = form.selectedSections.indexOf(sec.key) >= 0;
        html += '<button type="button" class="sec-btn' + (on ? " on" : "") + '" data-sec="' + sec.key + '" title="' + esc(sec.description || "") + '">' + esc(sec.title) + "</button>";
      });
      customs.forEach(function (sec) {
        var on = form.selectedSections.indexOf(sec.key) >= 0;
        html += '<button type="button" class="sec-btn' + (on ? " on" : "") + '" data-sec="' + sec.key + '" title="' + esc(sec.description || "自定义章节") + '">' + esc(sec.title) + "</button>";
        html += '<button type="button" class="sec-btn-del" data-delsec="' + sec.key + '" title="删除自定义章节">✕</button>';
      });
      html += '<button type="button" class="sec-btn add-custom" id="s-addsec">+ 自定义</button>';
      html += "</div><div id=" + '"s-customform"' + "></div>";
      html += "</div>";
      document.getElementById("app").innerHTML = html;

      document.getElementById("s-name").addEventListener("input", function (e) { form.name = e.target.value; });
      document.getElementById("s-busadd").addEventListener("click", function () {
        var v = document.getElementById("s-newbus").value.trim();
        if (!v) return;
        var list = Store.loadCustomBusiness();
        if (list.indexOf(v) < 0) list.push(v);
        Store.saveCustomBusiness(list);
        if (form.businessLine.indexOf(v) < 0) form.businessLine.push(v);
        self.renderStep1(id);
      });
      document.getElementById("s-deptadd").addEventListener("click", function () {
        var v = document.getElementById("s-newdept").value.trim();
        if (!v) return;
        var list = Store.loadCustomDept();
        if (list.indexOf(v) < 0) list.push(v);
        Store.saveCustomDept(list);
        if (form.dept.indexOf(v) < 0) form.dept.push(v);
        self.renderStep1(id);
      });
      document.getElementById("s-tagadd").addEventListener("click", function () {
        var v = document.getElementById("s-newtag").value.trim();
        if (v && form.tags.indexOf(v) < 0) { form.tags.push(v); self.renderStep1(id); }
      });
      document.querySelectorAll("#s-business .chip, #s-dept .chip, #s-priority .chip, #s-tags .chip").forEach(function (b) {
        b.addEventListener("click", function () {
          var dim = b.getAttribute("data-dim");
          var val = b.getAttribute("data-val");
          if (dim === "priority") {
            form.priority = form.priority === val ? "" : val;
          } else {
            var arr = form[dim];
            var i = arr.indexOf(val);
            if (i < 0) arr.push(val); else arr.splice(i, 1);
          }
          b.classList.toggle("on", dim === "priority" ? form.priority === val : form[dim].indexOf(val) >= 0);
        });
      });
      document.querySelectorAll(".sec-btn[data-sec]").forEach(function (b) {
        b.addEventListener("click", function () {
          var key = b.getAttribute("data-sec");
          var i = form.selectedSections.indexOf(key);
          if (i < 0) form.selectedSections.push(key); else form.selectedSections.splice(i, 1);
          b.classList.toggle("on", i < 0);
        });
      });
      document.querySelectorAll(".sec-btn-del").forEach(function (b) {
        b.addEventListener("click", function () {
          var key = b.getAttribute("data-delsec");
          if (!window.confirm("删除自定义章节「" + key + "」？")) return;
          form.selectedSections = form.selectedSections.filter(function (k) { return k !== key; });
          Store.saveCustomSections(Store.loadCustomSections().filter(function (x) { return x.key !== key; }));
          self.renderStep1(id);
        });
      });
      document.getElementById("s-addsec").addEventListener("click", function () {
        var box = document.getElementById("s-customform");
        box.innerHTML =
          '<div class="sec-btn-form">' +
          '<input type="text" id="c-title" placeholder="章节标题，如：9. 竞品分析">' +
          '<input type="text" id="c-desc" placeholder="撰写要求（可选）">' +
          '<button class="btn sm primary" id="c-ok">添加</button>' +
          '<button class="btn sm" id="c-cancel">取消</button></div>';
        document.getElementById("c-ok").addEventListener("click", function () {
          var title = document.getElementById("c-title").value.trim();
          if (!title) return;
          var list = Store.loadCustomSections();
          var sec = { key: "custom-" + Store.uid().slice(0, 8), title: title, description: document.getElementById("c-desc").value.trim() };
          list.push(sec);
          Store.saveCustomSections(list);
          form.selectedSections.push(sec.key);
          self.renderStep1(id);
        });
        document.getElementById("c-cancel").addEventListener("click", function () { box.innerHTML = ""; });
      });

      this.setFixedBar(
        '<button class="btn" id="fb-cancel" style="flex:1;padding:10px 14px;font-size:13px">取消</button>' +
        '<span class="spacer"></span>' +
        '<span class="muted" style="font-size:12px">下一步将进入材料输入</span>' +
        '<button class="btn primary" id="fb-step1-next" style="flex:1;padding:10px 14px;font-size:13px">下一步</button>'
      );
      document.getElementById("fb-cancel").addEventListener("click", function () { location.hash = "#/"; });
      document.getElementById("fb-step1-next").addEventListener("click", function () { self.saveStep1(); });
    },

    saveStep1: function () {
      var form = this.state.form;
      if (!form.name.trim()) { window.alert("请填写项目名称"); return; }
      var defaults = Templates.DEFAULTS[0].sections;
      var customs = Store.loadCustomSections();
      var all = defaults.concat(customs);
      var selected = all.filter(function (s) { return form.selectedSections.indexOf(s.key) >= 0; });
      if (!selected.length) { window.alert("请至少选择一个框架章节"); return; }
      var now = Date.now();
      var project = form.id ? Store.getProject(form.id) : null;
      if (project) {
        var old = {};
        project.sections.forEach(function (x) { old[x.key] = x.content || ""; });
        project.name = form.name.trim();
        project.businessLine = form.businessLine.slice();
        project.dept = form.dept.slice();
        project.priority = form.priority;
        project.tags = form.tags.slice();
        project.sections = selected.map(function (def) {
          return { key: def.key, title: def.title, description: def.description || "", content: old[def.key] || "" };
        });
        if (project.status === "draft") project.status = "editing";
        Store.upsertProject(project);
      } else {
        project = {
          id: Store.uid(),
          name: form.name.trim(),
          businessLine: form.businessLine.slice(),
          dept: form.dept.slice(),
          priority: form.priority,
          tags: form.tags.slice(),
          status: "editing",
          sections: selected.map(function (def) { return { key: def.key, title: def.title, description: def.description || "", content: "" }; }),
          attachments: [],
          createdAt: now,
          updatedAt: now,
        };
        Store.upsertProject(project);
      }
      location.hash = "#/edit/" + encodeURIComponent(project.id);
    },

    // ---------- 3. 创建向导 Step 2：AI 生成 + 逐节填写 + 附件 ----------

    renderStep2: function (id, mode) {
      var self = this;
      var p = Store.getProject(id);
      if (!p) {
        this.clearFixedBar();
        document.getElementById("app").innerHTML = '<div class="card">项目不存在。<a href="#/" class="btn sm" style="margin-left:10px">返回列表</a></div>';
        return;
      }
      if (p.simulated) { this.renderDetail(id); return; }
      this.state.project = p;

      // mode=editor → 直接显示富文本编辑器
      if (mode === "editor") {
        this.renderStep2EditorPage(p);
        return;
      }

      this.state.project = p;

      // 顶部项目信息
      var html = '<div class="row" style="justify-content:space-between">';
      html += '<div style="min-width:0;flex:1"><input class="name-input" id="e-name" value="' + esc(p.name) + '">';
      html += '<div id="e-meta" style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap"></div></div>';
      html += '<div class="muted" style="font-size:12.5px">第 2 步 / 共 3 步</div></div>';

      html += this.renderStep2AI(p);

      document.getElementById("app").innerHTML = html;

      // 绑定项目名称
      document.getElementById("e-name").addEventListener("input", function (e) { p.name = e.target.value || "未命名项目"; Store.upsertProject(p); });

      // 材料输入页不显示底部导航栏
      this.clearFixedBar();

      // 绑定 AI 材料输入事件
      this.wireStep2AI(p);
    },

    // ---- Step 2a: AI 生成 & 追问面板 ----

    renderStep2AI: function (p) {
      var self = this;
      var hasGenerated = p.questions && p.questions.length > 0;

      var html = "";
      // 材料输入区
      html += '<div class="card"><div class="material-main-title">材料输入</div>';

      // ① 系统模拟文件勾选区（最上方）
      html += '<div class="material-section" style="width:100%"><div class="material-section-title">勾选系统模拟文件</div>';
      html += '<div style="text-align:center;color:var(--warn);font-size:12px;margin-bottom:8px">为保障您的数据隐私安全，您可以不上传自己的文件，勾选下方 2-4 份系统模拟文件即可体验 PRD 生成</div>';
      html += '<div class="sample-grid" id="ai-sample-grid">';
      if (typeof SampleMaterials !== "undefined") {
        var samples = SampleMaterials.getList();
        var selectedSamples = this.state._selectedSamples || [];
        samples.forEach(function (sm) {
          var checked = selectedSamples.indexOf(sm.id) >= 0;
          html += '<label class="sample-check' + (checked ? " checked" : "") + '"><input type="checkbox" data-sm-id="' + sm.id + '"' + (checked ? " checked" : "") + ">";
          html += '<div><span class="sample-label">' + esc(sm.label) + '</span>';
          html += '<span class="sample-desc">' + esc(sm.desc) + "</span></div></label>";
        });
      }
      html += "</div>";
      html += '<div class="row" style="margin-top:8px;gap:8px;justify-content:center">';
      html += '<button class="btn sm primary" id="ai-sample-confirm">确认提交（' + (selectedSamples.length) + ' 份）</button>';
      html += '<button class="btn sm" id="ai-sample-clear">清空选择</button>';
      html += "</div></div>";

      // ②③ 文件拖拽 + 文本粘贴 并排
      html += '<div class="material-row">';

      html += '<div class="material-section material-half"><div class="material-section-title">上传或拖拽文件</div>';
      html += '<div class="drop-zone" id="ai-drop-zone" style="min-height:160px;display:flex;align-items:center;justify-content:center">';
      html += '<div class="drop-zone-inner">';
      html += '<div style="font-size:13px;color:#cfd6e2">拖拽文件到此处</div>';
      html += '<div style="font-size:11px;color:var(--muted);margin-top:4px">或点击选择文件</div>';
      html += '<div style="font-size:10px;color:var(--muted);margin-top:6px">支持 Word · PDF · PPT · TXT · MD</div>';
      html += '<div style="font-size:10px;color:var(--muted);margin-top:4px">Ctrl+V 粘贴文件</div>';
      html += "</div></div>";
      html += '<input type="file" id="ai-file-input" accept=".txt,.md,.markdown,.pptx,.docx,.pdf,.doc" style="display:none">';
      html += "</div>";

      html += '<div class="material-section material-half"><div class="material-section-title">粘贴文本内容</div>';
      html += '<textarea id="ai-paste-text" placeholder="在此粘贴需求文档、会议纪要、PRD 草稿……&#10;点击下方按钮添加到材料清单" style="min-height:160px;width:100%;resize:vertical">' + esc((this.state.aiPasteText || "")) + "</textarea>";
      html += '<div style="margin-top:8px"><button class="btn sm primary" id="ai-add-paste">添加为材料</button></div>';
      html += "</div>";

      html += "</div>"; // end material-row

      // 材料清单
      html += '<div id="ai-materials" style="margin-top:10px;clear:both">';
      if ((p.materials || []).length) {
        html += '<div class="edit-title" style="font-size:13px">📋 材料清单（' + p.materials.length + '） <span class="tag ok">可溯源</span></div>';
        p.materials.forEach(function (m, i) {
          var typeLabel = m.type || "text";
          html += '<div class="attach-item"><span class="tag blue">' + esc(typeLabel) + "</span>";
          html += '<span class="grow">' + esc(m.label) + "</span>";
          html += '<span class="muted" style="font-size:11px;margin-right:8px">' + (m.text ? m.text.length : 0) + " 字</span>";
          html += '<button class="btn sm" data-edit-mat="' + i + '" title="修改内容">✏️</button>';
          html += '<button class="btn sm danger" data-rm-mat="' + i + '">删除</button></div>';
        });
      } else {
        html += '<div class="muted" style="font-size:13px;padding:8px 0">还没有材料，先勾选系统模拟文件、上传文件或粘贴文本</div>';
      }
      html += "</div>";

      // 生成设置
      html += '<div class="row" style="margin-top:12px;gap:12px;flex-wrap:wrap;align-items:center">';
      html += '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#8b94a6"><input type="checkbox" id="ai-crossdept"' + (p.crossDept !== false ? " checked" : "") + ">跨部门协作</label>";
      html += "</div>";

      // 操作按钮行：放弃 + AI生成
      html += '<div class="row" style="margin-top:14px;align-items:center;gap:12px">';
      html += '<a href="#/" class="btn" style="flex:1;padding:10px 16px;font-size:13px;background:rgba(255,92,122,0.12);border:1px solid rgba(255,92,122,0.35);color:#ff5c7a;text-align:center;border-radius:8px">放弃生成，返回首页</a>';
      html += '<button class="btn primary" id="ai-generate" style="flex:2;padding:10px 16px;font-size:13px"' + (this.state.aiGenerating ? " disabled" : "") + ">";
      html += this.state.aiGenerating ? '<span class="spinner"></span> 正在生成初稿与追问…' : "AI 生成 PRD 初稿";
      html += "</button>";
      html += "</div>";
      html += '<div class="muted" style="font-size:11px;margin-top:4px;text-align:right">消耗 1 次 AI 额度（Demo 模式不消耗）</div>';

      if (this.state.aiError) {
        html += '<div class="banner warn" style="margin-top:10px">' + esc(this.state.aiError) + "</div>";
      }
      html += "</div>";

      // 追问面板（生成后显示）
      if (hasGenerated) {
        html += this.renderQuestionsHTML(p);
      }

      return html;
    },

    renderQuestionsHTML: function (p) {
      var self = this;
      var total = p.questions.length;
      var confirmed = p.questions.filter(function (q) { return q.status === "confirmed"; }).length;
      var pct = total ? Math.round((confirmed / total) * 100) : 0;
      var counts = {
        all: total,
        s1: p.questions.filter(function (q) { return q.stage === 1 && !q.dataLayer; }).length,
        s2: p.questions.filter(function (q) { return q.stage === 2 && !q.dataLayer; }).length,
        data: p.questions.filter(function (q) { return q.dataLayer; }).length,
      };
      var secCount = (function (sections) {
        var set = {};
        (sections || []).forEach(function (s) {
          var m = String(s.title || "").match(/^\s*(\d+)/);
          if (m) set[m[1]] = true;
        });
        return Object.keys(set).length || (sections ? sections.length : 0);
      })(p.sections);

      var html = '<div class="q-page">';

      // 固定顶部栏：进度 + 批量操作 + 筛选tabs
      html += '<div class="q-fixed-top">';
      html += '<div class="banner" style="margin-bottom:6px">生成完成，AI 提出 <b>' + total + " 条追问</b>" + (p.usedDemo ? "（Demo 模式）" : "") + "</div>";

      // 第一行：进度 + 次要操作靠右
      html += '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">';
      html += '<div class="progress-track" style="flex:0 1 80px"><i style="width:' + pct + '%"></i></div>';
      html += '<span style="font-size:12px;color:var(--muted)">已确认 ' + confirmed + " / " + total + "</span>";
      html += '<span class="spacer"></span>';
      html += '<button class="btn sm" id="q-skip-all">一键跳过全部</button>';
      html += '<button class="btn sm" id="q-enhance"' + (self.state.aiEnhancing ? " disabled" : "") + ">加强追问</button>";
      html += "</div>";
      // 第二行：一键全部使用建议答案（独占一行，显眼）
      html += '<div class="row" style="margin-bottom:8px">';
      html += '<button class="btn primary pulse" id="q-confirm-all" style="width:100%;padding:10px 16px;font-size:13px;font-weight:600">一键全部使用建议答案</button>';
      html += "</div>";
      html += '<div class="muted" style="font-size:11px;text-align:center;margin-bottom:6px">所有待确认追问将自动填入建议答案并确认，可在下方逐条修改</div>';

      // 追问筛选 tabs（固定在顶部）
      html += '<div class="tabs2" style="margin-bottom:8px">';
      [["all", "全部（" + counts.all + "）"], ["s1", "阶段一 · 框架覆盖（" + counts.s1 + "）"], ["s2", "阶段二 · 开发视角（" + counts.s2 + "）"], ["data", "数据层专项（" + counts.data + "）"]].forEach(function (tab) {
        html += '<span class="t' + (self.state.filter === tab[0] ? " active" : "") + '" data-q-filter="' + tab[0] + '">' + tab[1] + "</span>";
      });
      html += "</div>";

      // 追问列表
      var qs = p.questions.filter(function (q) {
        if (self.state.filter === "all") return true;
        if (self.state.filter === "s1") return q.stage === 1 && !q.dataLayer;
        if (self.state.filter === "s2") return q.stage === 2 && !q.dataLayer;
        return !!q.dataLayer;
      });

      if (!qs.length) {
        html += '<div class="empty" style="padding:20px">该分组下暂无追问</div>';
      } else {
        html += '<div id="ai-questions-list">';
        qs.forEach(function (q) {
          var stageTag = q.dataLayer ? "数据层专项" : q.stage === 1 ? "阶段一 · 框架覆盖" : "阶段二 · 开发视角";
          html += '<div class="q-card' + (q.status === "confirmed" ? " confirmed" : "") + (q.status === "skipped" ? " skipped" : "") + '">';
          html += '<div class="q-head"><span class="tag ' + (q.priority === "P0" ? "red" : q.priority === "P1" ? "warn" : "") + '">' + esc(q.priority) + "</span>";
          html += '<span class="tag blue">' + stageTag + "</span>";
          html += '<span class="tag">' + esc(q.sectionTitle || "") + "</span>";
          if (q.status === "confirmed") html += '<span class="tag ok">✓ 已确认</span>';
          if (q.status === "skipped") html += '<span class="tag warn">已跳过</span>';
          html += "</div>";
          html += '<div class="q-text">' + esc(q.question) + "</div>";
          if (q.impact) html += '<div class="q-risk"><span class="q-risk-label">缺失风险：</span>' + esc(q.impact) + "</div>";
          html += '<div class="q-answer">';
          html += (q.status === "confirmed"
            ? '<div class="locked-input-wrap"><input type="text" class="q-answer-input" data-q="' + q.id + '" value="' + esc(q.answer || "") + '" readonly style="opacity:0.6;cursor:not-allowed"><span class="locked-tooltip">请先进行撤销确认</span></div>'
            : '<input type="text" class="q-answer-input" data-q="' + q.id + '" value="' + esc(q.answer || "") + '" placeholder="输入你的答案">');
          html += '<div class="q-suggest">建议：' + esc(q.suggestedAnswer || "（无）") + "</div>";
          html += '<button class="btn sm" data-q-action="use-suggest" data-q="' + q.id + '" style="margin-top:6px">使用建议答案</button>';
          html += "</div>";
          html += '<div class="q-actions">';
          if (q.status === "confirmed") {
            html += '<button class="btn sm" data-q-action="undo" data-q="' + q.id + '">撤销确认</button>';
          } else {
            html += '<button class="btn sm primary" data-q-action="confirm" data-q="' + q.id + '">确认</button>';
            html += '<button class="btn sm" data-q-action="skip" data-q="' + q.id + '" ' + (q.status === "skipped" ? "disabled" : "") + ">跳过</button>";
          }
          if (q.status === "skipped") html += '<button class="btn sm" data-q-action="undo" data-q="' + q.id + '">撤销跳过</button>';
          html += "</div></div>";
        });
        html += "</div>";
      }

      html += '<div class="hint" style="margin-top:12px">跳过的问题会标注在导出文末，不阻塞导出流程</div>';
      html += "</div>"; // end q-scroll-content
      html += "</div>"; // end q-page

      return html;
    },

    renderStep2AIBar: function (p) {
      // 追问页底部固定导航栏
      var self = this;
      this.setFixedBar(
        '<button class="btn" id="fb-discard" style="flex:1;padding:10px 14px;font-size:13px">放弃此 PRD</button>' +
        '<button class="btn" id="fb-back" style="flex:1;padding:10px 14px;font-size:13px">返回上一步</button>' +
        '<button class="btn primary" id="fb-go-edit" style="flex:1;padding:10px 14px;font-size:13px">进入富文本编辑</button>'
      );
      // 事件在 wireStep2AI 中绑定
    },

    wireStep2AI: function (p) {
      var self = this;

      // 系统模拟文件勾选（仅允许 2-4 份）
      if (!self.state._selectedSamples) self.state._selectedSamples = [];
      document.querySelectorAll("#ai-sample-grid input[type=checkbox]").forEach(function (cb) {
        cb.addEventListener("change", function () {
          var smId = cb.getAttribute("data-sm-id");
          var label = cb.closest(".sample-check");
          if (cb.checked) {
            if (self.state._selectedSamples.length >= 4) {
              cb.checked = false;
              window.alert("最多选择 4 份模拟材料");
              return;
            }
            if (self.state._selectedSamples.indexOf(smId) < 0) self.state._selectedSamples.push(smId);
            if (label) label.classList.add("checked");
          } else {
            var idx = self.state._selectedSamples.indexOf(smId);
            if (idx >= 0) self.state._selectedSamples.splice(idx, 1);
            if (label) label.classList.remove("checked");
          }
          // 不立即加载，等确认提交
          // 更新确认按钮上的计数
          var confirmBtn = document.getElementById("ai-sample-confirm");
          if (confirmBtn) confirmBtn.textContent = "确认提交（" + self.state._selectedSamples.length + " 份）";
        });
      });

      // 确认提交按钮
      var confirmBtn = document.getElementById("ai-sample-confirm");
      if (confirmBtn) confirmBtn.addEventListener("click", function () {
        var sel = self.state._selectedSamples;
        if (sel.length < 2) { window.alert("请至少选择 2 份模拟材料"); return; }
        if (sel.length > 4) { window.alert("最多选择 4 份模拟材料"); return; }
        // 清除旧的模拟材料
        p.materials = (p.materials || []).filter(function (m) { return !m._smId; });
        // 加载所有选中材料
        var promises = sel.map(function (smId) {
          return SampleMaterials.loadContent(smId).then(function (text) {
            var meta = SampleMaterials.getById(smId);
            p.materials.push({ id: Store.uid(), label: meta.label, text: text, type: "md", _smId: smId });
          });
        });
        Promise.all(promises).then(function () {
          Store.upsertProject(p);
          self.renderStep2(p.id);
        }).catch(function (err) {
          window.alert("加载材料失败：" + (err.message || "未知错误"));
        });
      });

      // 清空选择按钮
      var clearBtn = document.getElementById("ai-sample-clear");
      if (clearBtn) clearBtn.addEventListener("click", function () {
        self.state._selectedSamples = [];
        p.materials = (p.materials || []).filter(function (m) { return !m._smId; });
        Store.upsertProject(p);
        self.renderStep2(p.id);
      });

      // 文本粘贴区
      document.getElementById("ai-paste-text").addEventListener("input", function (e) { self.state.aiPasteText = e.target.value; });
      document.getElementById("ai-add-paste").addEventListener("click", function () {
        var text = document.getElementById("ai-paste-text").value.trim();
        if (!text) return;
        var firstLine = (text.split("\n")[0] || "").slice(0, 40);
        var label = firstLine || "粘贴文本 " + (p.materials ? p.materials.length + 1 : 1);
        p.materials = p.materials || [];
        p.materials.push({ id: Store.uid(), label: label, text: text, type: "text" });
        document.getElementById("ai-paste-text").value = "";
        self.state.aiPasteText = "";
        Store.upsertProject(p);
        self.renderStep2(p.id);
      });

      // 文本输入框也支持 Ctrl+V 粘贴文件
      document.getElementById("ai-paste-text").addEventListener("paste", function (e) {
        var files = getFilesFromClipboard(e);
        if (!files.length) return; // 普通文本粘贴
        e.preventDefault();
        self.handleMaterialFiles(p, files);
      });

      // 文件拖拽区
      var dropZone = document.getElementById("ai-drop-zone");
      if (dropZone) {
        // 点击打开文件选择器
        dropZone.addEventListener("click", function () { document.getElementById("ai-file-input").click(); });
        // 拖拽高亮
        dropZone.addEventListener("dragover", function (e) { e.preventDefault(); dropZone.classList.add("dragover"); });
        dropZone.addEventListener("dragleave", function () { dropZone.classList.remove("dragover"); });
        dropZone.addEventListener("drop", function (e) {
          e.preventDefault();
          dropZone.classList.remove("dragover");
          if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
            self.handleMaterialFiles(p, Array.from(e.dataTransfer.files));
          }
        });
        // 文件拖拽区也支持 Ctrl+V 粘贴文件
        dropZone.addEventListener("paste", function (e) {
          var files = getFilesFromClipboard(e);
          if (!files.length) return;
          e.preventDefault();
          self.handleMaterialFiles(p, files);
        });
      }

      // 文件选择器
      document.getElementById("ai-file-input").addEventListener("change", function (e) {
        var files = e.target.files;
        if (files && files.length) self.handleMaterialFiles(p, Array.from(files));
        e.target.value = "";
      });

      // 删除材料
      document.querySelectorAll("[data-rm-mat]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = Number(btn.getAttribute("data-rm-mat"));
          p.materials.splice(i, 1);
          Store.upsertProject(p);
          self.renderStep2(p.id);
        });
      });

      // 编辑材料内容
      document.querySelectorAll("[data-edit-mat]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var i = Number(btn.getAttribute("data-edit-mat"));
          self.editMaterial(p, i);
        });
      });

      // 跨部门开关
      var cbCross = document.getElementById("ai-crossdept");
      if (cbCross) cbCross.addEventListener("change", function () { p.crossDept = cbCross.checked; Store.upsertProject(p); });

      // AI 生成
      document.getElementById("ai-generate").addEventListener("click", function () { self.generateDraft(p); });

      // 追问筛选
      document.querySelectorAll("[data-q-filter]").forEach(function (t) {
        t.addEventListener("click", function () {
          self.state.filter = t.getAttribute("data-q-filter");
          self.renderStep2(p.id);
        });
      });

      // 追问答案输入
      document.querySelectorAll(".q-answer-input").forEach(function (input) {
        input.addEventListener("input", function () {
          var id = input.getAttribute("data-q");
          var q = p.questions.find(function (x) { return x.id === id; });
          if (q) { q.answer = input.value; Store.upsertProject(p); }
        });
      });

      // 追问操作
      document.querySelectorAll("[data-q-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-q");
          var q = p.questions.find(function (x) { return x.id === id; });
          if (!q) return;
          var action = btn.getAttribute("data-q-action");
          if (action === "use-suggest") { q.answer = q.suggestedAnswer; self.renderStep2(p.id); return; }
          if (action === "confirm") { q.status = "confirmed"; q.answer = q.answer || q.suggestedAnswer; }
          else if (action === "skip") { q.status = "skipped"; }
          else { q.status = "pending"; }
          Store.upsertProject(p);
          self.renderStep2(p.id);
        });
      });

      // 追问顶部操作
      var fbDiscard = document.getElementById("fb-discard");
      if (fbDiscard) fbDiscard.addEventListener("click", function () { self.discardProject(p); });
      var fbBack = document.getElementById("fb-back");
      if (fbBack) fbBack.addEventListener("click", function () { location.hash = "#/new?id=" + encodeURIComponent(p.id); });
      var fbGoEdit = document.getElementById("fb-go-edit");
      if (fbGoEdit) fbGoEdit.addEventListener("click", function () {
        self.mergeAnswers(p);
        self.state.tab = "edit";
        self.renderStep2(p.id);
      });

      // 批量操作
      var btnSkipAll = document.getElementById("q-skip-all");
      if (btnSkipAll) btnSkipAll.addEventListener("click", function () {
        p.questions.forEach(function (q) { if (q.status === "pending") q.status = "skipped"; });
        Store.upsertProject(p);
        self.renderStep2(p.id);
      });
      var btnConfirmAll = document.getElementById("q-confirm-all");
      if (btnConfirmAll) btnConfirmAll.addEventListener("click", function () {
        p.questions.forEach(function (q) { if (q.status === "pending") { q.status = "confirmed"; q.answer = q.suggestedAnswer || q.answer; } });
        Store.upsertProject(p);
        self.renderStep2(p.id);
      });
      var btnEnhance = document.getElementById("q-enhance");
      if (btnEnhance) btnEnhance.addEventListener("click", function () { self.enhanceQuestions(p); });
    },

    editMaterial: function (p, index) {
      var self = this;
      var m = p.materials[index];
      if (!m) return;
      var root = document.getElementById("modal-root") || document.body;
      var mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.innerHTML =
        '<div class="modal" style="max-width:600px"><h3>✏️ 编辑材料内容</h3>' +
        '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">' + esc(m.label) + "（" + esc(m.type || "text") + "）</div>" +
        '<textarea id="mat-edit-text" style="min-height:200px;width:100%;font-size:12.5px">' + esc(m.text || "") + "</textarea>" +
        '<div class="row" style="justify-content:flex-end;gap:8px;margin-top:12px;margin-bottom:0">' +
        '<button class="btn sm" id="mat-edit-cancel">取消</button>' +
        '<button class="btn sm primary" id="mat-edit-save">保存修改</button></div></div>';
      root.appendChild(mask);
      document.getElementById("mat-edit-save").addEventListener("click", function () {
        var newText = document.getElementById("mat-edit-text").value;
        m.text = newText;
        // 更新标签为第一行文本
        var firstLine = (newText.split("\n")[0] || "").trim().slice(0, 40);
        if (firstLine) m.label = firstLine;
        Store.upsertProject(p);
        root.removeChild(mask);
        self.renderStep2(p.id);
      });
      document.getElementById("mat-edit-cancel").addEventListener("click", function () {
        root.removeChild(mask);
      });
      mask.addEventListener("click", function (e) {
        if (e.target === mask) root.removeChild(mask);
      });
    },

    showGenModal: function (message, onCancel) {
      var self = this;
      this._genCancelled = false;
      var mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.style.zIndex = "100000";
      mask.id = "gen-modal";
      mask.innerHTML =
        '<div class="modal" style="text-align:center">' +
        '<div class="spinner" style="width:36px;height:36px;border-width:3px;margin:0 auto 14px"></div>' +
        '<p style="color:#cfd6e2;font-size:14px;margin-bottom:14px">' + message + '</p>' +
        '<button class="btn sm" id="gen-cancel-btn">取消生成</button></div>';
      document.body.appendChild(mask);
      document.getElementById("gen-cancel-btn").addEventListener("click", function () {
        self._genCancelled = true;
        document.body.removeChild(mask);
        if (onCancel) onCancel();
      });
      return mask;
    },

    dismissGenModal: function () {
      var m = document.getElementById("gen-modal");
      if (m && m.parentElement) document.body.removeChild(m);
    },

    isGenCancelled: function () { return this._genCancelled; },

    handleMaterialFiles: function (p, files) {
      var self = this;
      if (!files || !files.length) return;
      p.materials = p.materials || [];

      var added = 0;
      var errors = [];
      var pending = files.length;

      function done() {
        if (added > 0) {
          Store.upsertProject(p);
          self.renderStep2(p.id);
        }
        if (errors.length) {
          window.alert("以下文件处理失败：\n" + errors.join("\n"));
        }
      }

      files.forEach(function (file) {
        if (typeof FileReader_util === "undefined") {
          // 降级：txt/md 用 FileReader，其他报错
          if (file.name.match(/\.(txt|md|markdown)$/i)) {
            var reader = new FileReader();
            reader.onload = function () {
              p.materials.push({ id: Store.uid(), label: file.name, text: reader.result, type: file.name.endsWith(".md") ? "md" : "txt" });
              added++;
              pending--;
              if (pending === 0) done();
            };
            reader.onerror = function () { errors.push(file.name + "：读取失败"); pending--; if (pending === 0) done(); };
            reader.readAsText(file);
          } else {
            errors.push(file.name + "：文件提取模块未加载");
            pending--;
            if (pending === 0) done();
          }
          return;
        }

        FileReader_util.extractFileText(file).then(function (text) {
          if (!text || !text.trim()) {
            errors.push(file.name + "：内容为空");
          } else {
            p.materials.push({
              id: Store.uid(),
              label: file.name,
              text: text,
              type: FileReader_util.fileTypeLabel(file),
            });
            added++;
          }
          pending--;
          if (pending === 0) done();
        }).catch(function (err) {
          errors.push(file.name + "：" + (err.message || "提取失败"));
          pending--;
          if (pending === 0) done();
        });
      });
    },

    generateDraft: function (p) {
      var self = this;
      if (!p.materials || !p.materials.length) {
        window.alert("请先粘贴或上传至少一份材料");
        return;
      }

      // 如果已有追问且材料未变，直接跳到追问页（不重复生成）
      var currentMatHash = (p.materials || []).map(function (m) { return m.id + ":" + (m.text || "").length; }).sort().join("|");
      if (p.questions && p.questions.length && p._lastMatHash === currentMatHash) {
        location.hash = "#/questions/" + encodeURIComponent(p.id);
        return;
      }
      p._lastMatHash = currentMatHash;
      Store.upsertProject(p);

      // 浏览器端用量检查
      var remaining = Store.usageRemaining();
      if (remaining <= 0) {
        var limit = (typeof window !== "undefined" && window.AI_USAGE_LIMIT) ? window.AI_USAGE_LIMIT : 5;
        window.alert("试用次数已达上限（" + limit + " 次），请明天再试或部署自己的服务端 Key。\nDemo 模式不占用额度。");
        return;
      }

      this.state.aiGenerating = true;
      this.state.aiError = "";
      this.showGenModal("正在生成 PRD 初稿与追问内容...", function () {
        self.state.aiGenerating = false;
      });
      this.renderStep2(p.id);

      var sections = p.sections.map(function (s) { return { key: s.key, title: s.title, description: s.description || "" }; });

      if (typeof AI === "undefined") {
        // 直接用 Demo 兜底
        var d = Demo.generateDraft(p.materials, sections, p.crossDept);
        this.handleAIResult(p, { usedDemo: true, name: d.name, sections: d.sections });
        return;
      }

      AI.callAi("draft", { materials: p.materials, sections: sections, crossDept: p.crossDept, prefs: p.prefs || { askDataSource: true, askDeadline: true, checkCalcLogic: false } })
        .then(function (draft) {
          // 生成追问
          return AI.callAi("questions", {
            draftSections: draft.sections,
            sections: sections,
            materials: p.materials,
            prefs: p.prefs,
          }).then(function (qRes) {
            var questions = (qRes && qRes.questions) || [];
            var fallbackMsg = "";
            if (!questions.length && !(qRes && qRes.usedDemo)) {
              try { questions = Demo.generateQuestions(draft.sections, p.materials, p.prefs); fallbackMsg = "真实模型追问失败，已用内置生成器补充"; }
              catch (e) { fallbackMsg = "追问生成失败：" + (e && e.message ? e.message : "未知错误"); }
            }
            self.handleAIResult(p, {
              usedDemo: !!(draft.usedDemo || (qRes && qRes.usedDemo)),
              name: draft.name,
              sections: draft.sections,
              questions: questions,
              fallbackMsg: fallbackMsg,
            });
          }).catch(function (e) {
            try { var qs = Demo.generateQuestions(draft.sections, p.materials, p.prefs); } catch (ex) { var qs = []; }
            self.handleAIResult(p, {
              usedDemo: !!draft.usedDemo,
              name: draft.name,
              sections: draft.sections,
              questions: qs,
              fallbackMsg: "真实模型追问失败，已用内置生成器补充",
            });
          });
        })
        .catch(function (e) {
          self.state.aiGenerating = false;
          self.state.aiError = "生成失败：" + (e.message || "请稍后重试") + "（Demo 模式可用）";
          self.dismissGenModal();
          self.renderStep2(p.id);
        });
    },

    handleAIResult: function (p, result) {
      if (this.isGenCancelled()) return;
      this.state.aiGenerating = false;
      this.state.aiError = "";
      this.dismissGenModal();

      // 成功才计次数（Demo 模式不计数）
      if (!result.usedDemo) {
        Store.incrementUsage();
      }

      // 写入章节内容
      result.sections.forEach(function (sec, i) {
        var target = p.sections[i];
        if (target && sec.content) target.content = sec.content;
      });

      // 更新项目名
      if (result.name && result.name.trim()) p.name = result.name;

      p.questions = result.questions || [];
      p.usedDemo = result.usedDemo;
      p.status = "editing";
      Store.upsertProject(p);

      // Demo 降级提示
      if (result.usedDemo) {
        var reason = result.demoReason || result.fallbackMsg || "";
        if (reason) {
          window.alert("ℹ️ " + reason + "\n\n内容已由内置 Demo 生成器产出，可在编辑器中直接修改。");
        }
      } else if (result.fallbackMsg) {
        window.alert("初稿已生成，" + result.fallbackMsg);
      }
      // 跳转到独立的追问页面
      location.hash = "#/questions/" + encodeURIComponent(p.id);
    },

    // ---- 独立追问页面 ----

    renderQuestionsPage: function (id) {
      var self = this;
      var p = Store.getProject(id);
      if (!p) {
        this.clearFixedBar();
        document.getElementById("app").innerHTML = '<div class="card">项目不存在。<a href="#/" class="btn sm" style="margin-left:10px">返回列表</a></div>';
        return;
      }
      this.state.project = p;
      if (!this.state.filter) this.state.filter = "all";

      var total = p.questions.length;
      if (!total) {
        // 没有追问，回到编辑页
        location.hash = "#/edit/" + encodeURIComponent(p.id);
        return;
      }

      var confirmed = p.questions.filter(function (q) { return q.status === "confirmed"; }).length;
      var pct = total ? Math.round((confirmed / total) * 100) : 0;
      var counts = {
        all: total,
        s1: p.questions.filter(function (q) { return q.stage === 1 && !q.dataLayer; }).length,
        s2: p.questions.filter(function (q) { return q.stage === 2 && !q.dataLayer; }).length,
        data: p.questions.filter(function (q) { return q.dataLayer; }).length,
      };

      var html = "";
      // 固定顶部：进度 + 批量操作 + 筛选tabs
      html += '<div class="q-fixed-top">';
      html += '<div class="banner" style="margin-bottom:6px">生成完成，AI 提出 <b>' + total + " 条追问</b>" + (p.usedDemo ? "（Demo 模式）" : "") + "</div>";

      // 第一行：进度 + 次要操作靠右
      html += '<div class="row" style="gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">';
      html += '<div class="progress-track" style="flex:0 1 80px"><i style="width:' + pct + '%"></i></div>';
      html += '<span style="font-size:12px;color:var(--muted)">已确认 ' + confirmed + " / " + total + "</span>";
      html += '<span class="spacer"></span>';
      html += '<button class="btn sm" id="q-skip-all">一键跳过全部</button>';
      html += '<button class="btn sm" id="q-enhance"' + (self.state.aiEnhancing ? " disabled" : "") + ">加强追问</button>";
      html += "</div>";
      // 第二行：一键全部使用建议答案（独占一行，显眼）
      html += '<div class="row" style="margin-bottom:8px">';
      html += '<button class="btn primary pulse" id="q-confirm-all" style="width:100%;padding:10px 16px;font-size:13px;font-weight:600">一键全部使用建议答案</button>';
      html += "</div>";
      html += '<div class="muted" style="font-size:11px;text-align:center;margin-bottom:6px">所有待确认追问将自动填入建议答案并确认，可在下方逐条修改</div>';

      // 筛选tabs（固定顶部）
      html += '<div class="tabs2">';
      [["all", "全部（" + counts.all + "）"], ["s1", "阶段一（" + counts.s1 + "）"], ["s2", "阶段二（" + counts.s2 + "）"], ["data", "数据层（" + counts.data + "）"]].forEach(function (tab) {
        html += '<span class="t' + (self.state.filter === tab[0] ? " active" : "") + '" data-q-filter="' + tab[0] + '">' + tab[1] + "</span>";
      });
      html += "</div></div>"; // end q-fixed-top

      // 滚动内容：追问列表
      html += '<div class="q-scroll-content">';
      var qs = p.questions.filter(function (q) {
        if (self.state.filter === "all") return true;
        if (self.state.filter === "s1") return q.stage === 1 && !q.dataLayer;
        if (self.state.filter === "s2") return q.stage === 2 && !q.dataLayer;
        return !!q.dataLayer;
      });

      if (!qs.length) {
        html += '<div class="empty" style="padding:20px">该分组下暂无追问</div>';
      } else {
        qs.forEach(function (q) {
          var stageTag = q.dataLayer ? "数据层专项" : q.stage === 1 ? "阶段一" : "阶段二";
          html += '<div class="q-card' + (q.status === "confirmed" ? " confirmed" : "") + (q.status === "skipped" ? " skipped" : "") + '">';
          html += '<div class="q-head"><span class="tag ' + (q.priority === "P0" ? "red" : q.priority === "P1" ? "warn" : "") + '">' + esc(q.priority) + "</span>";
          html += '<span class="tag blue">' + stageTag + "</span>";
          html += '<span class="tag">' + esc(q.sectionTitle || "") + "</span>";
          if (q.status === "confirmed") html += '<span class="tag ok">已确认</span>';
          if (q.status === "skipped") html += '<span class="tag warn">已跳过</span>';
          html += "</div>";
          html += '<div class="q-text">' + esc(q.question) + "</div>";
          if (q.impact) html += '<div class="q-risk"><span class="q-risk-label">缺失风险：</span>' + esc(q.impact) + "</div>";
          html += '<div class="q-answer">';
          html += (q.status === "confirmed"
            ? '<div class="locked-input-wrap"><input type="text" class="q-answer-input" data-q="' + q.id + '" value="' + esc(q.answer || "") + '" readonly style="opacity:0.6;cursor:not-allowed"><span class="locked-tooltip">请先进行撤销确认</span></div>'
            : '<input type="text" class="q-answer-input" data-q="' + q.id + '" value="' + esc(q.answer || "") + '" placeholder="输入你的答案">');
          html += '<div class="q-suggest">建议：' + esc(q.suggestedAnswer || "（无）") + "</div>";
          html += '<button class="btn sm" data-q-action="use-suggest" data-q="' + q.id + '" style="margin-top:6px">使用建议答案</button>';
          html += "</div>";
          html += '<div class="q-actions">';
          if (q.status === "confirmed") {
            html += '<button class="btn sm" data-q-action="undo" data-q="' + q.id + '">撤销确认</button>';
          } else {
            html += '<button class="btn sm primary" data-q-action="confirm" data-q="' + q.id + '">确认</button>';
            html += '<button class="btn sm" data-q-action="skip" data-q="' + q.id + '" ' + (q.status === "skipped" ? "disabled" : "") + ">跳过</button>";
          }
          if (q.status === "skipped") html += '<button class="btn sm" data-q-action="undo" data-q="' + q.id + '">撤销跳过</button>';
          html += "</div></div>";
        });
      }
      html += '<div class="hint" style="margin-top:16px">跳过的问题会标注在导出文末，不阻塞导出流程</div>';
      html += "</div>"; // end q-scroll-content

      document.getElementById("app").innerHTML = html;

      // 底部导航栏
      this.setFixedBar(
        '<button class="btn" id="fb-discard" style="flex:1;padding:10px 14px;font-size:13px">放弃此 PRD</button>' +
        '<button class="btn" id="fb-back" style="flex:1;padding:10px 14px;font-size:13px">返回上一步</button>' +
        '<button class="btn primary" id="fb-go-edit" style="flex:1;padding:10px 14px;font-size:13px">进入富文本编辑</button>'
      );

      // 绑定事件
      document.getElementById("fb-discard").addEventListener("click", function () { self.discardProject(p); });
      document.getElementById("fb-back").addEventListener("click", function () { location.hash = "#/edit/" + encodeURIComponent(p.id); });
      document.getElementById("fb-go-edit").addEventListener("click", function () {
        self.goToEditorWithRegen(p);
      });

      // 筛选
      document.querySelectorAll("[data-q-filter]").forEach(function (t) {
        t.addEventListener("click", function () { self.state.filter = t.getAttribute("data-q-filter"); self.renderQuestionsPage(p.id); });
      });

      // 答案输入：已确认锁定，改动自动撤销，Enter 确认
      document.querySelectorAll(".q-answer-input").forEach(function (input) {
        var qid = input.getAttribute("data-q");
        var q = p.questions.find(function (x) { return x.id === qid; });
        var originalAnswer = q ? q.answer : "";
        // 已确认的输入框点击时提示
        if (q && q.status === "confirmed") {
          input.addEventListener("click", function () {
            window.alert("此答案已确认，请先点击「撤销确认」后再修改");
          });
          input.addEventListener("focus", function () {
            input.blur();
            window.alert("此答案已确认，请先点击「撤销确认」后再修改");
          });
        }
        input.addEventListener("input", function () {
          if (!q) return;
          if (q.status === "confirmed") return; // 已确认锁定
          q.answer = input.value;
          if (q.status === "confirmed" && q.answer !== originalAnswer) {
            q.status = "pending";
          }
          Store.upsertProject(p);
        });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && q && q.status !== "confirmed") {
            e.preventDefault();
            q.status = "confirmed";
            q.answer = q.answer || q.suggestedAnswer;
            Store.upsertProject(p);
            self.renderQuestionsPage(p.id);
          }
        });
      });

      // 追问操作
      document.querySelectorAll("[data-q-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var qid = btn.getAttribute("data-q");
          var q = p.questions.find(function (x) { return x.id === qid; });
          if (!q) return;
          var action = btn.getAttribute("data-q-action");
          if (action === "use-suggest") { q.answer = q.suggestedAnswer; self.renderQuestionsPage(p.id); return; }
          if (action === "confirm") { q.status = "confirmed"; q.answer = q.answer || q.suggestedAnswer; }
          else if (action === "skip") { q.status = "skipped"; }
          else { q.status = "pending"; }
          Store.upsertProject(p);
          self.renderQuestionsPage(p.id);
        });
      });

      // 批量操作
      var btnSkipAll = document.getElementById("q-skip-all");
      if (btnSkipAll) {
        // 检查是否全部已跳过
        var allSkipped = p.questions.every(function (q) { return q.status === "skipped" || q.status === "confirmed"; });
        if (allSkipped && p.questions.some(function (q) { return q.status === "skipped"; })) {
          btnSkipAll.textContent = "撤销一键跳过全部";
        }
        btnSkipAll.addEventListener("click", function () {
          var nowAllSkipped = p.questions.every(function (q) { return q.status === "skipped" || q.status === "confirmed"; });
          if (nowAllSkipped && p.questions.some(function (q) { return q.status === "skipped"; })) {
            // 撤销所有跳过
            p.questions.forEach(function (q) { if (q.status === "skipped") q.status = "pending"; });
          } else {
            p.questions.forEach(function (q) { if (q.status === "pending") q.status = "skipped"; });
          }
          Store.upsertProject(p);
          self.renderQuestionsPage(p.id);
        });
      }
      var btnConfirmAll = document.getElementById("q-confirm-all");
      if (btnConfirmAll) btnConfirmAll.addEventListener("click", function () {
        p.questions.forEach(function (q) { if (q.status === "pending") { q.status = "confirmed"; q.answer = q.suggestedAnswer || q.answer; } });
        Store.upsertProject(p);
        self.renderQuestionsPage(p.id);
      });
      var btnEnhance = document.getElementById("q-enhance");
      if (btnEnhance) btnEnhance.addEventListener("click", function () { self.enhanceQuestionsPage(p); });
    },

    enhanceQuestionsPage: function (p) {
      var self = this;
      var mask = self.showGenModal("正在加载追问...", function () {
        // 取消不做任何事
      });

      var existing = p.questions || [];
      if (typeof AI === "undefined") {
        var fresh = Demo.generateEnhance(existing, p.sections, p.materials || []);
        p.questions = existing.concat(fresh);
        Store.upsertProject(p);
        self.dismissGenModal();
        self.renderQuestionsPage(p.id);
        window.alert(fresh.length ? "加强追问完成：新增 " + fresh.length + " 条追问" : "未发现新的遗漏点");
        return;
      }

      var sections = p.sections.map(function (s) { return { key: s.key, title: s.title, description: s.description || "" }; });
      AI.callAi("enhance", { existing: existing, draftSections: p.sections, sections: sections, materials: p.materials || [] })
        .then(function (res) {
          if (self.isGenCancelled()) return;
          var existingTexts = existing.map(function (q) { return q.question; });
          var fresh = (res.questions || []).filter(function (q) { return existingTexts.indexOf(q.question) < 0; });
          p.questions = existing.concat(fresh);
          Store.upsertProject(p);
          self.dismissGenModal();
          self.renderQuestionsPage(p.id);
          window.alert(fresh.length ? "加强追问完成：新增 " + fresh.length + " 条追问" : "未发现新的遗漏点");
        })
        .catch(function (e) {
          if (self.isGenCancelled()) return;
          var fresh = Demo.generateEnhance(existing, p.sections, p.materials || []);
          p.questions = existing.concat(fresh);
          Store.upsertProject(p);
          self.dismissGenModal();
          self.renderQuestionsPage(p.id);
          window.alert(fresh.length ? "加强追问完成（Demo）：新增 " + fresh.length + " 条" : "未发现遗漏");
        });
    },

    goToEditorWithRegen: function (p) {
      var self = this;
      // 先做基础合并
      this.mergeAnswers(p);

      // 检查是否有确认的答案需要 AI 重新生成
      var confirmed = (p.questions || []).filter(function (q) { return q.status === "confirmed" && q.answer && q.answer.trim(); });
      if (!confirmed.length) {
        location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
        return;
      }

      // 如果和上次进入编辑时没有新增/变更确认答案，跳过 AI
      var lastHash = p._lastConfirmHash || "";
      var currentHash = confirmed.map(function (q) { return q.id + ":" + q.answer; }).sort().join("|");
      if (currentHash === lastHash && p._lastConfirmHash !== undefined) {
        location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
        return;
      }
      p._lastConfirmHash = currentHash;
      Store.upsertProject(p);

      var mask = self.showGenModal("正在结合追问答案重新生成内容...", function () {
        // 取消生成，直接进入编辑（基础合并已完成）
        location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
      });

      var qaSummary = confirmed.map(function (q) {
        return "章节「" + q.sectionTitle + "」追问：「" + q.question + "」答案：「" + q.answer + "」";
      }).join("\n");

      var sections = p.sections.map(function (s) { return { key: s.key, title: s.title, description: s.description || "" }; });

      if (typeof AI === "undefined") {
        self.dismissGenModal();
        location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
        return;
      }

      AI.callAi("draft", {
        materials: (p.materials || []).concat([{ id: "qa", label: "追问确认答案", text: qaSummary, type: "text" }]),
        sections: sections,
        crossDept: p.crossDept,
        prefs: p.prefs || { askDataSource: true, askDeadline: true, checkCalcLogic: false },
      })
        .then(function (result) {
          if (self.isGenCancelled()) return;
          if (result.sections) {
            result.sections.forEach(function (sec, i) {
              var target = p.sections[i];
              if (target && sec.content && sec.content.trim()) {
                target.content = sec.content;
              }
            });
            Store.upsertProject(p);
          }
          self.dismissGenModal();
          location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
        })
        .catch(function () {
          if (self.isGenCancelled()) return;
          self.dismissGenModal();
          location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
        });
    },

    mergeAnswers: function (p) {
      var changed = false;
      (p.questions || []).forEach(function (q) {
        if (q.status !== "confirmed" || !q.answer || !q.answer.trim()) return;
        var sec = p.sections.find(function (s) { return s.key === q.sectionKey; });
        if (!sec) return;
        var answer = q.answer.trim();
        // 阶段一：替换「（待补充：...）」占位符
        if (q.stage === 1 && /（待补充/.test(sec.content || "")) {
          sec.content = (sec.content || "").replace(/（待补充[：:][^）]*）|（待补充）/g, answer);
          changed = true;
          return;
        }
        // 阶段二：追加"评审确认"
        if ((sec.content || "").indexOf("评审确认「" + q.question + "」") >= 0) return;
        sec.content = (sec.content || "") + '\n- 评审确认「' + q.question + '」：' + answer;
        changed = true;
      });
      if (changed) Store.upsertProject(p);
    },

    enhanceQuestions: function (p) {
      var self = this;
      this.state.aiEnhancing = true;
      this.renderStep2(p.id);

      var existing = p.questions || [];
      if (typeof AI === "undefined") {
        var fresh = Demo.generateEnhance(existing, p.sections, p.materials || []);
        p.questions = existing.concat(fresh);
        Store.upsertProject(p);
        this.state.aiEnhancing = false;
        this.renderStep2(p.id);
        window.alert(fresh.length ? "加强追问完成：新增 " + fresh.length + " 条追问（Demo 模式）" : "加强追问完成：未发现新的遗漏点");
        return;
      }

      var sections = p.sections.map(function (s) { return { key: s.key, title: s.title, description: s.description || "" }; });
      AI.callAi("enhance", {
        existing: existing,
        draftSections: p.sections,
        sections: sections,
        materials: p.materials || [],
      })
        .then(function (res) {
          var existingTexts = existing.map(function (q) { return q.question; });
          var fresh = (res.questions || []).filter(function (q) { return existingTexts.indexOf(q.question) < 0; });
          p.questions = existing.concat(fresh);
          Store.upsertProject(p);
          self.state.aiEnhancing = false;
          self.renderStep2(p.id);
          window.alert(fresh.length ? "加强追问完成：新增 " + fresh.length + " 条追问" : "加强追问完成：未发现新的遗漏点");
        })
        .catch(function (e) {
          var fresh = Demo.generateEnhance(existing, p.sections, p.materials || []);
          p.questions = existing.concat(fresh);
          Store.upsertProject(p);
          self.state.aiEnhancing = false;
          self.renderStep2(p.id);
          window.alert("加强追问失败：" + (e.message || "请稍后重试") + "，已用内置生成器补充 " + fresh.length + " 条");
        });
    },

    // ---- Step 2b: 富文本编辑 + 附件（独立页面，从 #/edit/:id?mode=editor 进入） ----

    renderStep2EditorPage: function (p) {
      var self = this;
      this.updateStep2Meta(p);
      document.getElementById("app").innerHTML = this.renderStep2EditorBody(p);
      this.wireStep2EditorEvents(p);

      // 底部导航
      this.setFixedBar(
        '<button class="btn danger" id="fb-discard" style="flex:1;padding:10px 14px;font-size:13px">放弃此 PRD</button>' +
        '<button class="btn" id="fb-save" style="flex:1;padding:10px 14px;font-size:13px">保存草稿</button>' +
        '<button class="btn" id="fb-back" style="flex:1;padding:10px 14px;font-size:13px">返回上一步</button>' +
        '<div class="export-menu" id="fb-export" style="position:relative;flex:1">' +
        '<button class="btn" id="fb-export-btn" style="width:100%;padding:10px 14px;font-size:13px">导出</button>' +
        '<div class="export-menu-items" id="fb-export-items" style="display:none;position:absolute;bottom:100%;right:0;margin-bottom:4px">' +
        '<button class="menu-item" data-export="pdf">导出 PDF</button>' +
        '<button class="menu-item" data-export="word">导出 Word</button>' +
        '<button class="menu-item" data-export="md">导出 Markdown</button>' +
        "</div></div>" +
        '<span class="spacer"></span>' +
        '<span id="fb-msg" class="ok-msg"></span>' +
        '<button class="btn primary" id="fb-next" style="flex:1;padding:10px 14px;font-size:13px">下一步</button>'
      );
      var msg = document.getElementById("fb-msg");
      document.getElementById("fb-save").addEventListener("click", function () { Store.upsertProject(p); if (msg) { msg.textContent = "已保存"; setTimeout(function () { msg.textContent = ""; }, 2000); } });
      document.getElementById("fb-discard").addEventListener("click", function () { self.discardProject(p); });
      document.getElementById("fb-back").addEventListener("click", function () {
        if (p.questions && p.questions.length) location.hash = "#/questions/" + encodeURIComponent(p.id);
        else location.hash = "#/edit/" + encodeURIComponent(p.id);
      });
      document.getElementById("fb-next").addEventListener("click", function () { location.hash = "#/preview/" + encodeURIComponent(p.id); });
      document.getElementById("fb-export-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        var items = document.getElementById("fb-export-items");
        items.style.display = items.style.display === "none" ? "block" : "none";
      });
      document.querySelectorAll("#fb-export-items .menu-item").forEach(function (b) {
        b.addEventListener("click", function () { document.getElementById("fb-export-items").style.display = "none";
          var kind = b.getAttribute("data-export");
          if (kind === "pdf") self.printPdf(p); else if (kind === "word") self.downloadWord(p); else self.downloadMarkdown(p);
        });
      });
    },

    wireStep2EditorEvents: function (p) {
      var self = this;
      document.querySelectorAll(".rte-area").forEach(function (area) {
        area.addEventListener("input", function () {
          var key = area.getAttribute("data-sec");
          var sec = p.sections.find(function (x) { return x.key === key; });
          if (sec) { sec.content = area.innerHTML; Store.upsertProject(p); self.updateStep2Meta(p);
            var tag = document.querySelector('.sidenav .item[data-jump="' + key + '"] .tag');
            var has = area.textContent.trim();
            if (tag) { tag.className = "tag" + (has ? " ok" : ""); tag.textContent = has ? "✓" : "空"; }
          }
        });
      });
      document.querySelectorAll(".rte-toolbar").forEach(function (bar) {
        var area = bar.nextElementSibling;
        bar.querySelectorAll("[data-cmd]").forEach(function (btn) {
          btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
          btn.addEventListener("click", function () {
            var cmd = btn.getAttribute("data-cmd");
            if (cmd === "image") pickImageFor(area);
            else { area.focus(); document.execCommand(cmd, false, null); }
          });
        });
        var color = bar.querySelector(".rte-color");
        if (color) { color.addEventListener("input", function () { var sel = window.getSelection(); if (sel && sel.rangeCount && !sel.isCollapsed && area.contains(sel.getRangeAt(0).commonAncestorContainer)) { document.execCommand("foreColor", false, color.value); } else { window.alert("请先选中要设置颜色的文字"); } }); }
      });
      document.querySelectorAll("[data-jump]").forEach(function (el) { el.addEventListener("click", function () { var key = el.getAttribute("data-jump"); var target = document.getElementById("sec-" + key); if (target) target.scrollIntoView({ behavior: "smooth", block: "start" }); }); });
      document.getElementById("att-add").addEventListener("click", function () { document.getElementById("att-input").click(); });
      document.getElementById("att-input").addEventListener("change", function (e) { var files = e.target.files; if (files && files.length) self.addAttachments(p, files); e.target.value = ""; });
      document.querySelectorAll("[data-attdel]").forEach(function (b) { b.addEventListener("click", function () { var att = p.attachments.find(function (a) { return a.id === b.getAttribute("data-attdel"); }); if (att) self.removeAttachment(p, att); }); });
      document.querySelectorAll("[data-attdown]").forEach(function (b) { b.addEventListener("click", function () { var att = p.attachments.find(function (a) { return a.id === b.getAttribute("data-attdown"); }); if (att) self.downloadAttachment(att); }); });
    },

    renderStep2EditorBody: function (p) {
      var self = this;
      var html = "";

      // 如果还有待确认追问，显示提醒
      var unconfirmed = (p.questions || []).filter(function (q) { return q.status !== "confirmed" && q.status !== "skipped"; });
      if (unconfirmed.length) {
        html += '<div class="banner warn" style="margin-bottom:12px">⚠️ 还有 ' + unconfirmed.length + ' 条追问待确认，可切换到「AI 生成 & 追问」tab 处理</div>';
      }
      if (p.usedDemo) {
        html += '<div class="banner" style="margin-bottom:12px;background:var(--neon-soft)">💡 Demo 模式生成，内容供参考。可在下方编辑器直接修改。</div>';
      }

      html += '<div class="cols" style="margin-top:0"><div class="col tight"><div class="sidenav"><div class="title">章节导航</div>';
      p.sections.forEach(function (sec) {
        var ok = (sec.content || "").trim().length > 0;
        var pend = (p.questions || []).filter(function (q) { return q.sectionKey === sec.key && q.status === "pending"; }).length;
        html += '<div class="item" data-jump="' + sec.key + '"><span class="t">' + esc(sec.title) + "</span>";
        html += ok ? '<span class="tag ok">✓</span>' : '<span class="tag">空</span>';
        if (pend > 0) html += '<span class="tag red" title="此章节有 ' + pend + ' 条追问待完成，建议完成（非必须）">' + pend + "</span>";
        html += "</div>";
      });
      html += "</div></div>";
      html += '<div class="col wide"><div id="e-sections">';
      html += '<input type="file" id="rte-img-input" accept="image/*" style="display:none">';
      p.sections.forEach(function (sec) {
        var initHtml = sec.content ? Export.renderContent(sec.content) : "";
        html += '<div class="edit-block" id="sec-' + sec.key + '">';
        html += '<div class="edit-title">' + esc(sec.title) + "</div>";
        if (sec.description) html += '<div class="edit-desc">' + esc(sec.description) + "</div>";
        html += '<div class="rte-toolbar">';
        html += '<button type="button" class="rte-btn" data-cmd="bold" title="加粗"><b>B</b></button>';
        html += '<button type="button" class="rte-btn" data-cmd="italic" title="斜体"><i>I</i></button>';
        html += '<button type="button" class="rte-btn" data-cmd="underline" title="下划线"><u>U</u></button>';
        html += '<input type="color" class="rte-color" data-cmd="foreColor" value="#c8ff3d" title="文字颜色">';
        html += '<button type="button" class="rte-btn" data-cmd="image" title="插入图片">图片</button>';
        html += "</div>";
        html += '<div class="rte-area" contenteditable="true" data-sec="' + sec.key + '" data-placeholder="在此填写本章节内容……">' + initHtml + "</div>";
        html += "</div>";
      });
      html += '<div class="card"><div class="edit-title">附件 <span class="muted" style="font-weight:400;font-size:12px">（单个不超过 10MB）</span></div>';
      html += '<input type="file" id="att-input" multiple style="display:none">';
      html += '<button class="btn sm" id="att-add">+ 添加附件</button>';
      (p.attachments || []).forEach(function (a) {
        html += '<div class="attach-item"><span class="tag blue">附件</span><span class="grow">' + esc(a.name) + "</span>";
        html += '<span class="muted" style="font-size:12px">' + fmtSize(a.size) + "</span>";
        html += '<button class="btn sm" data-attdown="' + a.id + '">下载</button>';
        html += '<button class="btn sm danger" data-attdel="' + a.id + '">删除</button></div>';
      });
      html += "</div></div></div>";
      return html;
    },

    renderStep2Editor: function (p) {
      var self = this;
      this.updateStep2Meta(p);

      // 绑定富文本编辑器事件
      document.querySelectorAll(".rte-area").forEach(function (area) {
        area.addEventListener("input", function () {
          var key = area.getAttribute("data-sec");
          var sec = p.sections.find(function (x) { return x.key === key; });
          if (sec) {
            sec.content = area.innerHTML;
            Store.upsertProject(p);
            self.updateStep2Meta(p);
            var tag = document.querySelector('.sidenav .item[data-jump="' + key + '"] .tag');
            var has = area.textContent.trim();
            if (tag) { tag.className = "tag" + (has ? " ok" : ""); tag.textContent = has ? "✓" : "空"; }
          }
        });
      });
      document.querySelectorAll(".rte-toolbar").forEach(function (bar) {
        var area = bar.nextElementSibling;
        bar.querySelectorAll("[data-cmd]").forEach(function (btn) {
          btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
          btn.addEventListener("click", function () {
            var cmd = btn.getAttribute("data-cmd");
            if (cmd === "image") pickImageFor(area);
            else {
              area.focus();
              document.execCommand(cmd, false, null);
            }
          });
        });
        var color = bar.querySelector(".rte-color");
        if (color) {
          color.addEventListener("input", function () {
            var sel = window.getSelection();
            if (sel && sel.rangeCount && !sel.isCollapsed && area.contains(sel.getRangeAt(0).commonAncestorContainer)) {
              document.execCommand("foreColor", false, color.value);
            } else {
              window.alert("请先选中要设置颜色的文字");
            }
          });
        }
      });
      document.querySelectorAll("[data-jump]").forEach(function (el) {
        el.addEventListener("click", function () {
          var key = el.getAttribute("data-jump");
          var target = document.getElementById("sec-" + key);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      document.getElementById("att-add").addEventListener("click", function () { document.getElementById("att-input").click(); });
      document.getElementById("att-input").addEventListener("change", function (e) {
        var files = e.target.files;
        if (files && files.length) self.addAttachments(p, files);
        e.target.value = "";
      });
      document.querySelectorAll("[data-attdel]").forEach(function (b) {
        b.addEventListener("click", function () {
          var att = p.attachments.find(function (a) { return a.id === b.getAttribute("data-attdel"); });
          if (att) self.removeAttachment(p, att);
        });
      });
      document.querySelectorAll("[data-attdown]").forEach(function (b) {
        b.addEventListener("click", function () {
          var att = p.attachments.find(function (a) { return a.id === b.getAttribute("data-attdown"); });
          if (att) self.downloadAttachment(att);
        });
      });

      // 底部操作栏
      this.setFixedBar(
        '<button class="btn danger" id="fb-discard">放弃此 PRD</button>' +
        '<button class="btn" id="fb-save">保存草稿</button>' +
        '<button class="btn" id="fb-back">返回上一步</button>' +
        '<div class="export-menu" id="fb-export">' +
        '<button class="btn" id="fb-export-btn">导出 ▾</button>' +
        '<div class="export-menu-items" id="fb-export-items" style="display:none">' +
        '<button class="menu-item" data-export="pdf">导出 PDF</button>' +
        '<button class="menu-item" data-export="word">导出 Word</button>' +
        '<button class="menu-item" data-export="md">导出 Markdown</button>' +
        "</div></div>" +
        '<span class="spacer"></span>' +
        '<span id="fb-msg" class="ok-msg"></span>' +
        '<button class="btn primary" id="fb-next">下一步 →</button>'
      );
      var msg = document.getElementById("fb-msg");
      document.getElementById("fb-save").addEventListener("click", function () {
        Store.upsertProject(p);
        if (msg) { msg.textContent = "草稿已保存 ✓"; setTimeout(function () { msg.textContent = ""; }, 2000); }
      });
      document.getElementById("fb-discard").addEventListener("click", function () { self.discardProject(p); });
      document.getElementById("fb-back").addEventListener("click", function () { location.hash = "#/new?id=" + encodeURIComponent(p.id); });
      document.getElementById("fb-next").addEventListener("click", function () { location.hash = "#/preview/" + encodeURIComponent(p.id); });
      document.getElementById("fb-export-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        var items = document.getElementById("fb-export-items");
        items.style.display = items.style.display === "none" ? "block" : "none";
      });
      document.querySelectorAll("#fb-export-items .menu-item").forEach(function (b) {
        b.addEventListener("click", function () {
          document.getElementById("fb-export-items").style.display = "none";
          var kind = b.getAttribute("data-export");
          if (kind === "pdf") self.printPdf(p);
          else if (kind === "word") self.downloadWord(p);
          else self.downloadMarkdown(p);
        });
      });

    },

    updateStep2Meta: function (p) {
      var el = document.getElementById("e-meta");
      if (!el) return;
      el.innerHTML =
        '<span class="tag">' + topLevelCount(p.sections) + " 节</span>" +
        '<span class="tag">已填 ' + this.filled(p) + " / " + p.sections.length + "</span>" +
        '<span class="tag">附件 ' + (p.attachments || []).length + "</span>";
    },

    addAttachments: function (p, files) {
      var self = this;
      var errs = [];
      var tasks = Array.from(files).map(function (file) {
        if (file.size > 10 * 1024 * 1024) {
          errs.push(file.name + " 超过 10MB");
          return null;
        }
        // 图片附件自动压缩后再存入 IndexedDB，保证列表与下载都轻量
        return new Promise(function (res) {
          compressImageFile(file, 1920, 0.85, function (out) { res(out); });
        }).then(function (blob) {
          var id = Store.uid();
          return Store.attachSave(id, blob).then(function () {
            p.attachments.push({ id: id, name: file.name, size: blob.size, type: blob.type || file.type || "" });
          });
        });
      }).filter(Boolean);
      Promise.all(tasks).then(function () {
        Store.upsertProject(p);
        if (errs.length) window.alert("以下文件未添加：" + errs.join("；"));
        self.renderStep2(p.id);
      }).catch(function () { window.alert("附件保存失败"); });
    },

    // 存量图片压缩迁移：附件图片 >400KB、富文本内嵌大图，后台逐步压缩替换
    migrateImages: function () {
      var self = this;
      Store.getUserProjects().forEach(function (p) {
        self.migrateAttachments(p);
        self.migrateRichImages(p);
      });
    },

    migrateAttachments: function (p) {
      var self = this;
      (p.attachments || []).forEach(function (a) {
        if ((a.type || "").indexOf("image/") !== 0 || a.size <= 400 * 1024) return;
        Store.attachGet(a.id).then(function (blob) {
          if (!blob || (blob.type || "").indexOf("image/") !== 0 || blob.size <= 400 * 1024) return;
          compressImageFile(blob, 1920, 0.85, function (out) {
            if (out === blob) return;
            Store.attachSave(a.id, out).then(function () {
              a.size = out.size;
              a.type = out.type || a.type;
              Store.upsertProject(p);
            }).catch(function () {});
          });
        }).catch(function () {});
      });
    },

    migrateRichImages: function (p) {
      var queue = [];
      p.sections.forEach(function (sec) {
        var html = sec.content || "";
        var re = /<img[^>]+src="(data:image\/[^";]+);base64,([^"]+)"/g;
        var m;
        while ((m = re.exec(html))) {
          if (m[2].length > 300 * 1024) queue.push({ sec: sec, match: m[0], mime: m[1].replace(/^data:/, ""), b64: m[2] });
        }
      });
      var run = function (i) {
        if (i >= queue.length) return;
        var item = queue[i];
        var blob = null;
        try {
          var bin = atob(item.b64);
          var bytes = new Uint8Array(bin.length);
          for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
          blob = new Blob([bytes], { type: item.mime });
        } catch (e) { run(i + 1); return; }
        compressImageFile(blob, 1280, 0.82, function (out) {
          if (out !== blob) {
            var fr = new FileReader();
            fr.onload = function () {
              item.sec.content = (item.sec.content || "").replace(item.match, '<img src="' + fr.result + '" loading="lazy" decoding="async" style="max-width:100%;border-radius:6px">');
              Store.upsertProject(p);
              run(i + 1);
            };
            fr.onerror = function () { run(i + 1); };
            fr.readAsDataURL(out);
          } else {
            run(i + 1);
          }
        }, true);
      };
      run(0);
    },

    removeAttachment: function (p, att) {
      var self = this;
      Store.attachRemove(att.id).then(function () {
        p.attachments = p.attachments.filter(function (a) { return a.id !== att.id; });
        Store.upsertProject(p);
        self.renderStep2(p.id);
      });
    },

    downloadAttachment: function (att) {
      Store.attachGet(att.id).then(function (blob) {
        if (!blob) { window.alert("附件不存在"); return; }
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = att.name;
        a.click();
        URL.revokeObjectURL(url);
      });
    },

    discardProject: function (p) {
      if (!window.confirm("确认放弃此 PRD？草稿与附件将被删除，不可恢复。")) return;
      Promise.all((p.attachments || []).map(function (a) { return Store.attachRemove(a.id).catch(function () {}); })).then(function () {
        Store.deleteProject(p.id);
        location.hash = "#/";
      });
    },

    // ---------- 4. 创建向导 Step 3：预览 / 导出 ----------

    renderStep3: function (id) {
      var self = this;
      var p = Store.getProject(id);
      if (!p) {
        this.clearFixedBar();
        document.getElementById("app").innerHTML = '<div class="card">项目不存在。<a href="#/" class="btn sm" style="margin-left:10px">返回列表</a></div>';
        return;
      }
      var html = '<div class="preview-sticky-top"><div class="row" style="justify-content:space-between">';
      html += '<h1 class="page-title" style="margin:0">' + esc(p.name) + "</h1>";
      html += '<div class="muted" style="font-size:12.5px">第 3 步 / 共 3 步 · 预览</div></div>';
      html += '<div class="meta-row" style="margin-top:6px">';
      (p.businessLine || []).forEach(function (b) { html += '<span class="tag blue">' + esc(b) + "</span>"; });
      (p.dept || []).forEach(function (d) { html += '<span class="tag">' + esc(d) + "</span>"; });
      if (p.priority) html += '<span class="tag ' + (p.priority === "P0" ? "red" : p.priority === "P1" ? "warn" : "") + '">' + esc(p.priority) + "</span>";
      (p.tags || []).forEach(function (t) { html += '<span class="tag ok">' + esc(t) + "</span>"; });
      html += "</div></div>";
      html += '<div class="card preview-content" style="margin-top:14px">';
      p.sections.forEach(function (sec) {
        html += "<h2>" + esc(sec.title) + "</h2>";
        html += lazyImg(Export.renderContent(sec.content));
      });
      html += "</div>";
      if ((p.attachments || []).length) {
        html += '<div class="card" style="margin-top:14px"><div class="edit-title">附件</div>';
        p.attachments.forEach(function (a) {
          html += '<div class="attach-item"><span class="tag blue">附件</span><span class="grow">' + esc(a.name) + "</span>";
          html += '<span class="muted" style="font-size:12px">' + fmtSize(a.size) + "</span>";
          html += '<button class="btn sm" data-attdown="' + a.id + '">下载</button></div>';
        });
        html += "</div>";
      }
      document.getElementById("app").innerHTML = html;
      document.querySelectorAll("[data-attdown]").forEach(function (b) {
        b.addEventListener("click", function () {
          var att = p.attachments.find(function (a) { return a.id === b.getAttribute("data-attdown"); });
          if (att) self.downloadAttachment(att);
        });
      });
      this.setFixedBar(
        '<button class="btn" id="pv-back" style="flex:1;padding:10px 14px;font-size:13px">返回上一步</button>' +
        '<button class="btn" id="pv-md" style="flex:1;padding:10px 14px;font-size:13px">导出 MD</button>' +
        '<button class="btn" id="pv-word" style="flex:1;padding:10px 14px;font-size:13px">导出 Word</button>' +
        '<button class="btn" id="pv-pdf" style="flex:1;padding:10px 14px;font-size:13px">导出 PDF</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn primary" id="pv-done" style="flex:1;padding:10px 14px;font-size:13px">完成</button>'
      );
      document.getElementById("pv-back").addEventListener("click", function () {
        location.hash = "#/edit/" + encodeURIComponent(p.id) + "?mode=editor";
      });
      document.getElementById("pv-md").addEventListener("click", function () { self.downloadMarkdown(p); });
      document.getElementById("pv-word").addEventListener("click", function () { self.downloadWord(p); });
      document.getElementById("pv-pdf").addEventListener("click", function () { self.printPdf(p); });
      document.getElementById("pv-done").addEventListener("click", function () {
        p.status = "done";
        Store.upsertProject(p);
        location.hash = "#/";
      });
    },

    // ---------- 5. PRD 详情页 ----------

    renderDetail: function (id) {
      var self = this;
      var p = Store.getProject(id);
      if (!p) {
        this.clearFixedBar();
        document.getElementById("app").innerHTML = '<div class="card">项目不存在或已被删除。<a href="#/" class="btn sm" style="margin-left:10px">返回列表</a></div>';
        return;
      }
      var html = '<div class="row" style="justify-content:space-between">';
      html += '<div style="min-width:0;flex:1"><h1 class="page-title" style="margin:0">' + esc(p.name) + "</h1>";
      html += '<div class="meta-row" style="margin-top:8px">';
      (p.businessLine || []).forEach(function (b) { html += '<span class="tag blue">' + esc(b) + "</span>"; });
      (p.dept || []).forEach(function (d) { html += '<span class="tag">' + esc(d) + "</span>"; });
      if (p.priority) html += '<span class="tag ' + (p.priority === "P0" ? "red" : p.priority === "P1" ? "warn" : "") + '">' + esc(p.priority) + "</span>";
      (p.tags || []).forEach(function (t) { html += '<span class="tag ok">' + esc(t) + "</span>"; });
      html += '<span class="tag ' + (p.status === "done" ? "ok" : p.status === "editing" ? "blue" : "") + '">' + (STATUS_TEXT[p.status] || "草稿") + "</span>";
      html += '<span class="tag">已填 ' + this.filled(p) + "/" + p.sections.length + "</span>";
      html += '<span class="tag">更新 ' + fmtTime(p.updatedAt) + "</span>";
      if (p.simulated) html += '<span class="tag blue">系统模拟</span>';
      html += "</div></div>";
      html += '<div class="row" style="margin:0">';
      html += '<a href="#/" class="btn sm">返回列表</a>';
      if (!p.simulated) {
        html += '<a href="#/edit/' + encodeURIComponent(p.id) + '?mode=editor" class="btn sm">编辑</a>';
        html += '<button class="btn sm" id="d-status">' + (p.status === "done" ? "重新编辑" : "标记完成") + "</button>";
      }
      html += '<button class="btn sm" id="d-md">Markdown</button>';
      html += '<button class="btn sm" id="d-word">Word</button>';
      html += '<button class="btn sm" id="d-pdf">PDF</button>';
      if (!p.simulated) html += '<button class="btn sm danger" id="d-del">删除</button>';
      html += "</div></div>";
      html += '<div class="card preview-content" style="margin-top:14px">';
      p.sections.forEach(function (sec) {
        html += "<h2>" + esc(sec.title) + "</h2>";
        html += lazyImg(Export.renderContent(sec.content));
      });
      html += "</div>";
      if ((p.attachments || []).length) {
        html += '<div class="card" style="margin-top:14px"><div class="edit-title">附件</div>';
        p.attachments.forEach(function (a) {
          html += '<div class="attach-item"><span class="tag blue">附件</span><span class="grow">' + esc(a.name) + "</span>";
          html += '<span class="muted" style="font-size:12px">' + fmtSize(a.size) + "</span>";
          html += '<button class="btn sm" data-attdown="' + a.id + '">下载</button></div>';
        });
        html += "</div>";
      }
      document.getElementById("app").innerHTML = html;
      var dStatus = document.getElementById("d-status");
      if (dStatus) dStatus.addEventListener("click", function () {
        p.status = p.status === "done" ? "editing" : "done";
        Store.upsertProject(p);
        self.renderDetail(p.id);
      });
      document.getElementById("d-md").addEventListener("click", function () { self.downloadMarkdown(p); });
      document.getElementById("d-word").addEventListener("click", function () { self.downloadWord(p); });
      document.getElementById("d-pdf").addEventListener("click", function () { self.printPdf(p); });
      var dDel = document.getElementById("d-del");
      if (dDel) dDel.addEventListener("click", function () {
        if (!window.confirm("确认删除该项目？该操作不可恢复。")) return;
        Promise.all((p.attachments || []).map(function (a) { return Store.attachRemove(a.id).catch(function () {}); })).then(function () {
          Store.deleteProject(p.id);
          location.hash = "#/";
        });
      });
      document.querySelectorAll("[data-attdown]").forEach(function (b) {
        b.addEventListener("click", function () {
          var att = p.attachments.find(function (a) { return a.id === b.getAttribute("data-attdown"); });
          if (att) self.downloadAttachment(att);
        });
      });
    },

    // ---------- 导出 ----------

    downloadMarkdown: function (p) {
      var md = Export.projectToMarkdown(p);
      var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = p.name.replace(/[\/\\:*?"<>|]/g, "-") + ".md";
      a.click();
      URL.revokeObjectURL(url);
    },

    downloadWord: function (p) {
      var html = Export.exportHtml(p);
      var blob = new Blob(["\ufeff" + html], { type: "application/msword" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = p.name.replace(/[\/\\:*?"<>|]/g, "-") + ".doc";
      a.click();
      URL.revokeObjectURL(url);
    },

    printPdf: function (p) {
      // 方案：把导出版本注入页面内隐藏打印区，再同步调用 window.print()。
      // 相比「0x0 隐藏 iframe + 延迟 print()」，不会被浏览器静默拦截，桌面/手机均可导出 PDF。
      var full = Export.exportHtml(p);
      var body = full.replace(/^[\s\S]*?<body>/, "").replace(/<\/body>[\s\S]*$/, "");
      var root = document.getElementById("print-root");
      if (!root) {
        root = document.createElement("div");
        root.id = "print-root";
        root.setAttribute("aria-hidden", "true");
        document.body.appendChild(root);
      }
      root.innerHTML = body;
      var cleanup = function () {
        root.innerHTML = "";
        window.removeEventListener("afterprint", cleanup);
      };
      window.addEventListener("afterprint", cleanup);
      window.print();
    },
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", function () { App.init(); });
})(window);
