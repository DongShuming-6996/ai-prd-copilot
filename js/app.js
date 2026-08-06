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
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function detectType(text, label) {
    if (/BID|LightHouse|需求文段/i.test(text)) return "lighthouse";
    if (/会议|纪要|参会|待办|对齐/i.test(text)) return "minutes";
    if ((label || "").toLowerCase().indexOf(".pptx") >= 0 || /PPT|幻灯片/i.test(text)) return "ppt";
    return "text";
  }

  var TYPE_TEXT = { lighthouse: "LightHouse", minutes: "会议纪要", ppt: "PPT", text: "文本" };
  var STATUS_TEXT = { draft: "草稿", questions: "追问中", editing: "编辑中", done: "已完成" };

  function topLevelCount(sections) {
    var set = {};
    (sections || []).forEach(function (s) {
      var m = String(s.title || "").match(/^\s*(\d+)/);
      if (m) set[m[1]] = true;
    });
    var n = Object.keys(set).length;
    return n || (sections ? sections.length : 0);
  }

  var App = {
    state: {
      projects: [],
      project: null,
      tab: "questions",
      filter: "all",
      activeKey: "",
      modal: null,
      generating: false,
      error: null,
      notice: null,
      templateId: "qc-8",
      selectedSections: [],
      crossDept: true,
      prefs: { askDataSource: true, askDeadline: true, checkCalcLogic: false },
      pasteText: "",
      materials: [],
      settings: { apiKey: "", model: "" },
      customTemplates: [],
      newName: "",
      newSections: "",
    },

    findTpl: function (id) {
      var list = Store.loadTemplates();
      return list.find(function (t) { return t.id === id; }) || list[0] || Templates.DEFAULTS[0];
    },

    init: function () {
      var self = this;
      this.state.settings = Store.loadSettings();
      window.addEventListener("hashchange", function () { self.route(); });
      this.route();
    },

    route: function () {
      this.updateNav();
      this.updateModeBadge();
      var hash = location.hash || "#/";
      if (hash.indexOf("#/project/") === 0) {
        this.renderProject(decodeURIComponent(hash.slice(10)));
      } else if (hash === "#/new") {
        this.renderNew();
      } else if (hash === "#/settings") {
        this.renderSettings();
      } else {
        this.renderList();
      }
    },

    updateNav: function () {
      var hash = location.hash || "#/";
      var map = {
        "nav-home": hash === "#/" || hash === "",
        "nav-new": hash.indexOf("#/new") === 0,
        "nav-settings": hash.indexOf("#/settings") === 0,
      };
      ["nav-home", "nav-new", "nav-settings"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.className = "nav-item" + (map[id] ? " active" : "");
      });
    },

    updateModeBadge: function () {
      var el = document.getElementById("mode-badge");
      if (!el) return;
      AI.checkServerKey().then(function (has) {
        if (has) {
          el.textContent = "真实模型模式 · 服务端 Key";
          el.href = "#";
          el.className = "demo-badge live";
        } else {
          el.textContent = "Demo 模式 · 未配置服务端 Key → 查看设置";
          el.href = "#/settings";
          el.className = "demo-badge";
        }
      });
    },

    // ---------- 列表页 ----------

    renderList: function () {
      var self = this;
      this.clearFixedBar();
      this.state.projects = Store.loadProjects();
      var projects = this.state.projects;
      var html = '<h1 class="page-title">我的 PRD</h1>';
      html += '<div class="row" style="justify-content:space-between; margin-bottom:14px">';
      html += '<a href="#/new" class="btn primary">+ 新建 PRD</a></div>';

      if (!projects.length) {
        html += '<div class="empty"><p style="margin:0 0 12px">还没有项目</p>';
        html += '<a href="#/new" class="btn primary">粘贴材料，生成第一份 PRD 初稿</a></div>';
      } else {
        projects.forEach(function (p) {
          var pending = p.questions.filter(function (q) { return q.status === "pending"; }).length;
          html += '<div class="card project-card">';
          html += '<div class="meta"><a href="#/project/' + encodeURIComponent(p.id) + '" class="name">' + esc(p.name) + "</a>";
          html += '<div class="sub">' + fmtTime(p.updatedAt) + " · " + topLevelCount(p.sections) + " 节 · ";
          html += p.questions.length ? pending + " 条追问待确认" : "无追问";
          html += p.usedDemo ? " · Demo 生成" : "";
          html += "</div></div>";
          html += '<span class="tag ' + (p.status === "questions" ? "warn" : "ok") + '">' + (STATUS_TEXT[p.status] || p.status) + "</span>";
          html += '<a href="#/project/' + encodeURIComponent(p.id) + '" class="btn sm">打开</a>';
          html += '<button class="btn sm danger" data-del="' + p.id + '">删除</button>';
          html += "</div>";
        });
      }
      document.getElementById("app").innerHTML = html;
      document.querySelectorAll("[data-del]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (window.confirm("确认删除该项目？该操作不可恢复。")) {
            Store.deleteProject(btn.getAttribute("data-del"));
            self.renderList();
          }
        });
      });
    },

    // ---------- 输入页 ----------

    renderNew: function () {
      var self = this;
      var s = this.state;
      this.clearFixedBar();
      var allSections = Templates.DEFAULTS[0].sections;
      var customSections = Store.loadCustomSections();
      if (!s.selectedSections || !s.selectedSections.length) {
        s.selectedSections = allSections
          .map(function (sec) { return sec.key; })
          .concat(customSections.map(function (sec) { return sec.key; }));
      }
      var usage = Store.loadUsage();
      var usageLimit = Number(window.AI_USAGE_LIMIT || 5);
      var usageWin = window.AI_USAGE_WINDOW || "total";
      var today = new Date().toISOString().slice(0, 10);
      if (usageWin === "day" && usage.day !== today) usage = { count: 0, day: today };
      var remaining = Math.max(0, usageLimit - (usage.count || 0));

      var html = '<h1 class="page-title">新建 PRD 项目</h1><div class="cols">';
      html += '<div class="col wide">';
      html += '<div class="card"><div style="font-weight:600; margin-bottom:8px">① 粘贴材料</div>';
      html += '<textarea id="paste-text" placeholder="粘贴 LightHouse 需求文段、会议纪要、PPT 文本……（支持多段材料，逐段添加）">' + esc(s.pasteText) + "</textarea>";
      html += '<div class="row" style="margin-top:10px"><button class="btn sm" id="add-paste" ' + (s.pasteText.trim() ? "" : "disabled") + ">添加到材料清单</button></div></div>";
      html += '<div style="text-align:center;color:#aaa;font-size:12px;margin:10px 0">或</div>';
      html += '<div class="card"><div style="font-weight:600; margin-bottom:8px">② 上传文件</div>';
      html += '<div class="drop" id="drop-zone">拖拽文件到此处，或点击上传<br>支持 txt / md / pptx（PPT 在浏览器端提取文本）</div>';
      html += '<input type="file" id="file-input" accept=".txt,.md,.pptx" style="display:none">';
      html += "</div>";
      html += '<div class="card"><div style="font-weight:600; margin-bottom:8px">③ 材料清单 <span class="tag ok">可溯源</span></div>';
      if (!s.materials.length) {
        html += '<div class="muted" style="font-size:13px">还没有材料，先粘贴或上传</div>';
      } else {
        s.materials.forEach(function (m) {
          html += '<div class="list-item"><span class="tag blue">' + (TYPE_TEXT[m.type] || "文本") + "</span>";
          html += '<span class="grow">' + esc(m.label) + "</span>";
          html += '<button class="btn sm" data-rm="' + m.id + '">删除</button></div>';
        });
        html += '<button class="btn sm" id="clear-all" style="margin-top:10px">清空全部</button>';
      }
      html += "</div></div>";

      html += '<div class="col"><div class="card"><div style="font-weight:600; margin-bottom:4px">生成设置</div>';
      html += '<div style="font-size:12.5px;color:#66707f;margin-bottom:8px">点击章节按钮选择要生成的框架（选中黄色发光，默认全选）</div>';
      html += '<div class="sec-grid">';
      allSections.forEach(function (sec) {
        var on = s.selectedSections.indexOf(sec.key) >= 0;
        html += '<button type="button" class="sec-btn' + (on ? " on" : "") + '" data-sec="' + sec.key + '">' + esc(sec.title) + "</button>";
      });
      customSections.forEach(function (sec) {
        var on = s.selectedSections.indexOf(sec.key) >= 0;
        html += '<button type="button" class="sec-btn' + (on ? " on" : "") + '" data-sec="' + sec.key + '" title="' + esc(sec.description || "自定义章节") + '">' + esc(sec.title) + "</button>";
        html += '<button type="button" class="sec-btn-del" data-delsec="' + sec.key + '" title="删除自定义章节">✕</button>';
      });
      html += '<button type="button" class="sec-btn add-custom" id="add-custom-sec">+ 自定义</button>';
      html += '</div><div id="custom-form"></div>';
      html += '<div class="row" style="margin-top:6px"><span class="field-label">跨部门协作</span>';
      html += '<span class="switch' + (s.crossDept ? "" : " off") + '" id="cross-switch"></span>';
      html += '<span style="font-size:12.5px">开启后数据层拆「本组 / 跨部门」</span></div>';
      if (s.error) html += '<div class="error-box">' + esc(s.error) + "</div>";
      if (s.notice) html += '<div class="ok-msg" style="margin:8px 0">' + esc(s.notice) + "</div>";
      html += '<button class="btn primary block" id="generate-btn" style="margin-top:14px" ' + (s.generating ? "disabled" : "") + ">";
      html += s.generating ? '<span class="spinner" style="display:inline-block; width:13px; height:13px; border-width:2px; vertical-align:-2px"></span> 正在生成初稿与追问…' : "生成 PRD 初稿";
      html += "</button>";
      html += '<div class="hint">生成后进入追问面板：两阶段追问可逐条确认 / 修改 / 一键跳过</div>';
      html += '<div class="hint">' + (remaining > 0
        ? "本机剩余试用：<b style='color:#c8ff3d'>" + remaining + " / " + usageLimit + "</b> 次（" + (usageWin === "day" ? "每日重置" : "累计") + "）"
        : "本机试用次数已用完") + "</div>";
      html += "</div></div></div>";

      document.getElementById("app").innerHTML = html;

      var pasteEl = document.getElementById("paste-text");
      pasteEl.addEventListener("input", function () {
        s.pasteText = pasteEl.value;
        document.getElementById("add-paste").disabled = !pasteEl.value.trim();
      });
      document.getElementById("add-paste").addEventListener("click", function () {
        self.addMaterial(s.pasteText);
      });
      var dropZone = document.getElementById("drop-zone");
      dropZone.addEventListener("click", function () {
        document.getElementById("file-input").click();
      });
      ["dragenter", "dragover"].forEach(function (ev) {
        dropZone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropZone.classList.add("drag-on");
        });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        dropZone.addEventListener(ev, function (e) {
          e.preventDefault();
          dropZone.classList.remove("drag-on");
        });
      });
      dropZone.addEventListener("drop", function (e) {
        var files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          Array.from(files).forEach(function (f) { self.handleFile(f); });
        } else {
          s.error = "未识别到文件，请直接拖拽文件到此处";
          self.renderNew();
        }
      });
      // 防止把文件拖到页面其他位置时浏览器直接打开文件
      window.addEventListener("dragover", function (e) { e.preventDefault(); });
      window.addEventListener("drop", function (e) { e.preventDefault(); });
      document.getElementById("file-input").addEventListener("change", function (e) {
        var file = e.target.files && e.target.files[0];
        if (file) self.handleFile(file);
        e.target.value = "";
      });
      document.querySelectorAll(".sec-btn[data-sec]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-sec");
          var idx = s.selectedSections.indexOf(key);
          if (idx < 0) s.selectedSections.push(key); else s.selectedSections.splice(idx, 1);
          btn.classList.toggle("on", idx < 0);
        });
      });
      document.querySelectorAll(".sec-btn-del").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var key = btn.getAttribute("data-delsec");
          if (!window.confirm("删除自定义章节「" + key + "」？")) return;
          s.selectedSections = s.selectedSections.filter(function (k) { return k !== key; });
          Store.saveCustomSections(Store.loadCustomSections().filter(function (x) { return x.key !== key; }));
          self.renderNew();
        });
      });
      document.getElementById("add-custom-sec").addEventListener("click", function () {
        var form = document.getElementById("custom-form");
        form.innerHTML =
          '<div class="sec-btn-form">' +
          '<input type="text" id="cus-title" placeholder="章节标题，如：9. 竞品分析">' +
          '<input type="text" id="cus-desc" placeholder="撰写要求（可选），如：竞品在做什么、我们的差异点">' +
          '<button class="btn sm primary" id="cus-ok">添加</button>' +
          '<button class="btn sm" id="cus-cancel">取消</button>' +
          "</div>";
        document.getElementById("cus-ok").addEventListener("click", function () {
          var title = document.getElementById("cus-title").value.trim();
          if (!title) return;
          var list = Store.loadCustomSections();
          var sec = { key: "custom-" + Store.uid().slice(0, 8), title: title, description: document.getElementById("cus-desc").value.trim() };
          list.push(sec);
          Store.saveCustomSections(list);
          s.selectedSections.push(sec.key);
          self.renderNew();
        });
        document.getElementById("cus-cancel").addEventListener("click", function () { form.innerHTML = ""; });
      });
      document.getElementById("cross-switch").addEventListener("click", function () {
        s.crossDept = !s.crossDept;
        this.className = "switch" + (s.crossDept ? "" : " off");
      });
      document.getElementById("generate-btn").addEventListener("click", function () { self.generate(); });
      var clearBtn = document.getElementById("clear-all");
      if (clearBtn) clearBtn.addEventListener("click", function () {
        s.materials = [];
        self.renderNew();
      });
      document.querySelectorAll("[data-rm]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          s.materials = s.materials.filter(function (m) { return m.id !== btn.getAttribute("data-rm"); });
          self.renderNew();
        });
      });
    },

    addMaterial: function (text, type, label) {
      var s = this.state;
      var trimmed = (text || "").trim();
      if (!trimmed) return;
      var t = type || detectType(trimmed, label);
      var autoLabel = label ||
        ((trimmed.split("\n")[0] || "").slice(0, 24) || "材料 " + (s.materials.length + 1)) + "（" + TYPE_TEXT[t] + "）";
      s.materials.push({ id: Store.uid(), type: t, label: autoLabel, text: trimmed });
      s.pasteText = "";
      s.error = null;
      this.renderNew();
    },

    handleFile: function (file) {
      var self = this;
      if (file.name.toLowerCase().indexOf(".pptx") >= 0) {
        Pptx.extractPptxText(file)
          .then(function (text) {
            self.state.notice = file.name + " 已加入材料清单";
            self.addMaterial(text, "ppt", file.name + "（PPT 文本已提取）");
          })
          .catch(function (e) { self.state.error = "文件读取失败：" + (e.message || "未知错误") + "，可改为粘贴文本"; self.renderNew(); });
      } else {
        file.text()
          .then(function (text) {
            self.state.notice = file.name + " 已加入材料清单";
            self.addMaterial(text, undefined, file.name);
          })
          .catch(function () { self.state.error = "文件读取失败，可改为粘贴文本"; self.renderNew(); });
      }
    },

    switchTemplate: function (id) {
      var s = this.state;
      s.templateId = id;
      var t = this.findTpl(id);
      s.crossDept = t.crossDeptDefault;
      s.prefs = Object.assign({}, t.prefs);
      this.renderNew();
    },

    generate: function () {
      var self = this;
      var s = this.state;
      if (!s.materials.length) {
        s.error = "请先粘贴或上传至少一份材料";
        this.renderNew();
        return;
      }
      s.generating = true;
      s.error = null;
      this.renderNew();

      var allSections = Templates.DEFAULTS[0].sections.concat(Store.loadCustomSections());
      var sections = allSections.filter(function (sec) { return s.selectedSections.indexOf(sec.key) >= 0; });
      if (!sections.length) {
        s.error = "请至少勾选一个框架章节";
        s.generating = false;
        this.renderNew();
        return;
      }
      var usage = Store.loadUsage();
      var usageLimit = Number(window.AI_USAGE_LIMIT || 5);
      var usageWin = window.AI_USAGE_WINDOW || "total";
      var today = new Date().toISOString().slice(0, 10);
      if (usageWin === "day" && usage.day !== today) {
        usage = { count: 0, day: today };
        Store.saveUsage(usage);
      }
      if ((usage.count || 0) >= usageLimit) {
        s.error = "试用次数已用完（" + usageLimit + " 次），请明天再来或联系作者";
        s.generating = false;
        this.renderNew();
        return;
      }
      AI.callAi("draft", { materials: s.materials, sections: sections, crossDept: s.crossDept, prefs: s.prefs })
        .then(function (draft) {
          return AI.callAi("questions", {
            draftSections: draft.sections,
            sections: sections,
            materials: s.materials,
            prefs: s.prefs,
          })
            .then(function (qRes) {
              var now = Date.now();
              var questions = (qRes && qRes.questions) || [];
              var fallbackMsg = "";
              if (!questions.length && !(qRes && qRes.usedDemo)) {
                try {
                  questions = Demo.generateQuestions(draft.sections, s.materials, s.prefs);
                  fallbackMsg = "真实模型追问失败，已用内置生成器补充";
                } catch (e) {
                  fallbackMsg = "追问生成失败：" + (e && e.message ? e.message : "未知错误");
                }
              }
              var project = {
                id: Store.uid(),
                name: draft.name,
                createdAt: now,
                updatedAt: now,
                materials: s.materials,
                templateId: s.templateId,
                crossDept: s.crossDept,
                prefs: Object.assign({}, s.prefs),
                sections: draft.sections,
                questions: questions,
                status: "questions",
                usedDemo: !!draft.usedDemo,
              };
              Store.upsertProject(project);
              usage.count = (usage.count || 0) + 1;
              usage.day = today;
              Store.saveUsage(usage);
              s.generating = false;
              s.materials = [];
              location.hash = "#/project/" + encodeURIComponent(project.id);
              if (fallbackMsg) {
                window.alert("初稿已生成，" + fallbackMsg + "。");
              }
            });
        })
        .catch(function (e) {
          s.generating = false;
          s.error = e.message || "生成失败，请稍后重试";
          self.renderNew();
        });
    },

    // ---------- 项目页 ----------

    renderProject: function (id) {
      var self = this;
      var project = Store.getProject(id);
      if (!project) {
        this.clearFixedBar();
        document.getElementById("app").innerHTML =
          '<div class="card">项目不存在或已被删除。<a href="#/" class="btn sm" style="margin-left:10px">返回列表</a></div>';
        return;
      }
      this.state.project = project;
      this.state.activeKey = project.sections[0] ? project.sections[0].key : "";
      this.state.tab = "questions";

      var html = '<div class="row" style="justify-content:space-between">';
      html += '<div style="min-width:0; flex:1">';
      html += '<input class="name-input" id="proj-name" value="' + esc(project.name) + '">';
      html += '<div id="proj-meta" style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap"></div>';
      html += "</div></div>";
      html += '<div style="margin-top:18px" id="project-body"></div>';
      document.getElementById("app").innerHTML = html;

      document.getElementById("proj-name").addEventListener("input", function (e) {
        var p = self.state.project;
        p.name = e.target.value || "未命名项目";
        Store.upsertProject(p);
      });
      this.updateProjectHeader(project);
      this.renderProjectBody();
    },

    updateProjectHeader: function (p) {
      var el = document.getElementById("proj-meta");
      if (!el) return;
      var pendCount = p.questions.filter(function (q) { return q.status === "pending"; }).length;
      var confirmedCount = p.questions.filter(function (q) { return q.status === "confirmed"; }).length;
      el.innerHTML =
        '<span class="tag">' + topLevelCount(p.sections) + " 节</span>" +
        '<span class="tag ' + (pendCount > 0 ? "warn" : "ok") + '">' +
        (pendCount > 0 ? pendCount + " 条追问待确认" : "追问已处理（确认 " + confirmedCount + " 条）") +
        "</span>" +
        (p.usedDemo ? '<span class="tag">Demo 生成</span>' : "");
    },

    renderProjectBody: function () {
      var body = document.getElementById("project-body");
      if (!body) return;
      var self = this;
      var p = this.state.project;
      if (this.state.tab === "questions") {
        if (!p.questions.length) {
          this.clearFixedBar();
          body.innerHTML = '<div class="card">该项目没有生成追问（可能追问生成失败，初稿已保留）。';
          body.innerHTML += '<button class="btn sm" style="margin-left:10px" id="go-enhance-empty">重新生成追问</button>';
          body.innerHTML += '<button class="btn sm primary" style="margin-left:10px" id="go-edit-empty">进入编辑页</button></div>';
          document.getElementById("go-enhance-empty").addEventListener("click", function () {
            self.enhanceQuestions(p);
          });
          document.getElementById("go-edit-empty").addEventListener("click", function () {
            self.mergeAnswers(p);
            self.state.tab = "edit";
            self.renderProject(p.id);
          });
          return;
        }
        body.innerHTML = this.renderQuestionsHTML(p);
        this.setFixedBar(this.renderQuestionsBar(p));
        this.wireQuestions(p);
      } else {
        body.innerHTML = this.renderEditorHTML(p);
        this.setFixedBar(this.renderEditorBar(p));
        this.wireEditor(p);
      }
    },

    // ---------- 追问面板 ----------

    renderQuestionsHTML: function (p) {
      var s = this.state;
      var total = p.questions.length;
      var confirmed = p.questions.filter(function (q) { return q.status === "confirmed"; }).length;
      var pct = total ? Math.round((confirmed / total) * 100) : 0;
      var counts = {
        all: total,
        s1: p.questions.filter(function (q) { return q.stage === 1 && !q.dataLayer; }).length,
        s2: p.questions.filter(function (q) { return q.stage === 2 && !q.dataLayer; }).length,
        data: p.questions.filter(function (q) { return q.dataLayer; }).length,
      };
      var secCount = topLevelCount(p.sections);
      var html = '<div class="banner">✅ 生成完成 · ' + secCount + "/" + secCount + " 章节已生成 · AI 提出 <b>" + total + " 条追问</b>" + (p.usedDemo ? "（Demo 模式）" : "") + "</div>";
      if (p.usedDemo) {
        html += '<div class="banner warn" style="margin-top:8px">服务端未配置 API Key · 当前为 Demo 模式，<a href="#/settings" style="color:#c8ff3d;text-decoration:underline">查看部署说明 →</a></div>';
      }
      html += '<div class="row"><span style="font-size:12.5px">处理进度</span>';
      html += '<div class="progress-track"><i style="width:' + pct + '%"></i></div>';
      html += '<span style="font-size:12.5px">已确认 ' + confirmed + " / " + total + "</span></div>";
      html += '<div class="cols"><div class="col narrow"><div class="sidenav"><div class="title">PRD 章节目录</div><div class="sec-circles">';
      p.sections.forEach(function (sec) {
        var pend = p.questions.filter(function (q) { return q.sectionKey === sec.key && q.status === "pending"; }).length;
        var skip = p.questions.filter(function (q) { return q.sectionKey === sec.key && q.status === "skipped"; }).length;
        var cls = pend > 0 ? "" : skip > 0 ? "skip" : "done";
        html += '<div class="sec-dot ' + cls + '" title="' + esc(sec.title) + '"><span class="dot">' + (p.sections.indexOf(sec) + 1) + '</span><span class="t">' + esc(sec.title) + "</span></div>";
      });
      html += "</div></div></div>";

      html += '<div class="col wide"><div class="tabs2">';
      [["all", "全部（" + counts.all + "）"], ["s1", "阶段一 · 框架覆盖（" + counts.s1 + "）"], ["s2", "阶段二 · 开发视角（" + counts.s2 + "）"], ["data", "数据层专项（" + counts.data + "）"]].forEach(function (tab) {
        html += '<span class="t' + (s.filter === tab[0] ? " active" : "") + '" data-filter="' + tab[0] + '">' + tab[1] + "</span>";
      });
      html += "</div>";

      var qs = p.questions.filter(function (q) {
        if (s.filter === "all") return true;
        if (s.filter === "s1") return q.stage === 1 && !q.dataLayer;
        if (s.filter === "s2") return q.stage === 2 && !q.dataLayer;
        return !!q.dataLayer;
      });
      if (!qs.length) {
        html += '<div class="empty" style="padding:30px">该分组下暂无追问</div>';
      } else {
        qs.forEach(function (q) {
          var stageTag = q.dataLayer ? "数据层专项" : q.stage === 1 ? "阶段一 · 框架覆盖" : "阶段二 · 开发视角";
          html += '<div class="q-card' + (q.status === "confirmed" ? " confirmed" : "") + (q.status === "skipped" ? " skipped" : "") + '">';
          html += '<div class="q-head"><span class="tag ' + (q.priority === "P0" ? "red" : q.priority === "P1" ? "warn" : "") + '">' + q.priority + "</span>";
          html += '<span class="tag blue">' + stageTag + "</span>";
          html += '<span class="tag">' + esc(q.sectionTitle) + "</span>";
          if (q.status === "confirmed") html += '<span class="tag ok">✓ 已确认</span>';
          if (q.status === "skipped") html += '<span class="tag warn">已跳过</span>';
          html += "</div>";
          html += '<div class="q-text">' + esc(q.question) + "</div>";
          html += '<div class="q-answer"><label>建议答案</label>';
          html += '<input type="text" class="q-answer-input" data-q="' + q.id + '" value="' + esc(q.answer) + '" placeholder="' + esc(q.suggestedAnswer || "（无建议答案，请填写）") + '"></div>';
          html += '<div class="q-actions">';
          if (q.status === "confirmed") {
            html += '<button class="btn sm" data-action="undo" data-q="' + q.id + '">撤销确认</button>';
          } else {
            html += '<button class="btn sm primary" data-action="confirm" data-q="' + q.id + '">确认</button>';
            html += '<button class="btn sm" data-action="skip" data-q="' + q.id + '" ' + (q.status === "skipped" ? "disabled" : "") + ">跳过</button>";
          }
          if (q.status === "skipped") html += '<button class="btn sm" data-action="undo" data-q="' + q.id + '">撤销跳过</button>';
          if (q.impact) html += '<span style="font-size:11.5px;color:#2563eb">↳ 影响 ' + esc(q.impact) + "</span>";
          html += "</div></div>";
        });
      }

      html += '<div class="hint">跳过的问题会进入 PRD 末尾「未确认项」清单，不阻塞导出</div>';
      html += "</div></div>";
      return html;
    },

    wireQuestions: function (p) {
      var self = this;
      document.querySelectorAll("[data-filter]").forEach(function (t) {
        t.addEventListener("click", function () {
          self.state.filter = t.getAttribute("data-filter");
          self.renderProjectBody();
        });
      });
      document.querySelectorAll(".q-answer-input").forEach(function (input) {
        input.addEventListener("input", function () {
          var id = input.getAttribute("data-q");
          var q = p.questions.find(function (x) { return x.id === id; });
          if (q) {
            q.answer = input.value;
            Store.upsertProject(p);
          }
        });
      });
      document.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var id = btn.getAttribute("data-q");
          var q = p.questions.find(function (x) { return x.id === id; });
          if (!q) return;
          var action = btn.getAttribute("data-action");
          if (action === "confirm") {
            q.status = "confirmed";
            q.answer = q.answer || q.suggestedAnswer;
          } else if (action === "skip") {
            q.status = "skipped";
          } else {
            q.status = "pending";
          }
          Store.upsertProject(p);
          self.updateProjectHeader(p);
          self.renderProjectBody();
        });
      });
      document.getElementById("fb-skip-all").addEventListener("click", function () {
        p.questions.forEach(function (q) { if (q.status === "pending") q.status = "skipped"; });
        Store.upsertProject(p);
        self.updateProjectHeader(p);
        self.renderProjectBody();
      });
      document.getElementById("fb-confirm-all").addEventListener("click", function () {
        p.questions.forEach(function (q) {
          if (q.status === "pending") {
            q.status = "confirmed";
            q.answer = q.answer || q.suggestedAnswer;
          }
        });
        Store.upsertProject(p);
        self.updateProjectHeader(p);
        self.renderProjectBody();
      });
      document.getElementById("fb-enhance").addEventListener("click", function () { self.enhanceQuestions(p); });
      document.getElementById("fb-go-edit").addEventListener("click", function () {
        self.mergeAnswers(p);
        self.state.tab = "edit";
        self.renderProject(p.id);
      });
    },

    // ---------- 编辑页 ----------

    renderEditorHTML: function (p) {
      var s = this.state;
      var unconfirmed = p.questions.filter(function (q) { return q.status !== "confirmed"; });
      var html = '<div class="row">';
      html += '<span style="font-size:13px;color:#666">' + (unconfirmed.length ? '<span class="tag warn">' + unconfirmed.length + " 项未确认（会标注在导出文末）</span>" : '<span class="tag ok">全部确认 ✓</span>');
      if (p.usedDemo) html += '<span class="tag" style="margin-left:8px">Demo 生成</span>';
      html += "</span>";
      html += '<div class="cols" style="margin-top:14px"><div class="col tight"><div class="sidenav"><div class="title">章节导航</div>';
      p.sections.forEach(function (sec) {
        var pend = p.questions.filter(function (q) { return q.sectionKey === sec.key && q.status === "pending"; }).length;
        var skip = p.questions.filter(function (q) { return q.sectionKey === sec.key && q.status === "skipped"; }).length;
        html += '<div class="item' + (s.activeKey === sec.key ? " active" : "") + '" data-jump="' + sec.key + '"><span class="t">' + esc(sec.title) + "</span>";
        html += pend > 0 ? '<span class="tag red">' + pend + "</span>" : skip > 0 ? '<span class="tag warn">跳过</span>' : '<span class="tag ok">✓</span>';
        html += "</div>";
      });
      html += "</div>";
      html += '<div class="card" style="margin-top:12px; padding:10px 12px"><div style="font-weight:600; font-size:12.5px; margin-bottom:6px">未确认项清单（' + unconfirmed.length + "）</div>";
      if (!unconfirmed.length) {
        html += '<div style="font-size:12px;color:#999">全部已确认 🎉</div>';
      } else {
        unconfirmed.forEach(function (q) {
          var qText = q.question.length > 24 ? q.question.slice(0, 24) + "…" : q.question;
          html += '<div style="font-size:12px;padding:3px 0;color:#555"><span style="color:#2563eb;cursor:pointer" data-jump="' + q.sectionKey + '">§' + esc(q.sectionTitle) + "：</span>" + esc(qText) + "</div>";
        });
      }
      html += "</div></div>";

      html += '<div class="col wide">';
      p.sections.forEach(function (sec) {
        html += '<div class="edit-block" id="sec-' + sec.key + '">';
        html += '<div class="edit-title">' + esc(sec.title);
        var pend = p.questions.filter(function (q) { return q.sectionKey === sec.key && q.status === "pending"; }).length;
        if (pend > 0) html += '<span class="tag warn">' + pend + " 条待确认</span>";
        (sec.sources || []).forEach(function (src, i) {
          html += '<span class="src-chip" data-src="' + i + '" data-sec="' + sec.key + '">↳ 来源：' + esc(src.materialLabel) + "</span>";
        });
        html += "</div>";
        html += '<div class="edit-desc">本节由 AI 生成，可直接编辑修改</div>';
        html += '<textarea data-sec="' + sec.key + '" rows="' + Math.min(14, Math.max(5, sec.content.split("\n").length + 2)) + '">' + esc(sec.content) + "</textarea>";
        html += "</div>";
      });
      html += "</div></div>";
      return html;
    },

    wireEditor: function (p) {
      var self = this;
      document.querySelectorAll("[data-jump]").forEach(function (el) {
        el.addEventListener("click", function () {
          var key = el.getAttribute("data-jump");
          self.state.activeKey = key;
          var target = document.getElementById("sec-" + key);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
          document.querySelectorAll("[data-jump]").forEach(function (x) { x.classList.remove("active"); });
          el.classList.add("active");
        });
      });
      document.querySelectorAll("textarea[data-sec]").forEach(function (ta) {
        ta.addEventListener("input", function () {
          var key = ta.getAttribute("data-sec");
          var sec = p.sections.find(function (x) { return x.key === key; });
          if (sec) {
            sec.content = ta.value;
            Store.upsertProject(p);
          }
        });
      });
      document.querySelectorAll(".src-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          var secKey = chip.getAttribute("data-sec");
          var idx = Number(chip.getAttribute("data-src"));
          var sec = p.sections.find(function (x) { return x.key === secKey; });
          if (sec && sec.sources[idx]) {
            self.showModal(sec.sources[idx]);
          }
        });
      });
      var barMsg = document.getElementById("fb-msg");
      document.getElementById("fb-save-draft").addEventListener("click", function () {
        Store.upsertProject(p);
        if (barMsg) {
          barMsg.textContent = "草稿已保存到本地浏览器 ✓";
          setTimeout(function () { barMsg.textContent = ""; }, 2200);
        }
      });
      document.getElementById("fb-save-word").addEventListener("click", function () { self.downloadWord(p); });
      document.getElementById("fb-save-pdf").addEventListener("click", function () { self.printPdf(p); });
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

    renderQuestionsBar: function (p) {
      var s = this.state;
      var total = p.questions.length;
      var confirmed = p.questions.filter(function (q) { return q.status === "confirmed"; }).length;
      return (
        '<button class="btn" id="fb-skip-all">一键跳过全部</button>' +
        '<button class="btn" id="fb-confirm-all">全部确认</button>' +
        '<button class="btn" id="fb-enhance"' + (s.enhancing ? " disabled" : "") + ">" +
        (s.enhancing ? "加强追问中…" : "加强追问") + "</button>" +
        '<span class="spacer"></span>' +
        '<span class="muted" style="font-size:12px">已确认 ' + confirmed + " / " + total + "</span>" +
        '<button class="btn primary" id="fb-go-edit">进入编辑页 →</button>'
      );
    },

    renderEditorBar: function () {
      return (
        '<span class="muted" style="font-size:12px">编辑内容已自动保存到本地浏览器</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn" id="fb-save-draft">保存草稿</button>' +
        '<button class="btn" id="fb-save-word">保存为 Word</button>' +
        '<button class="btn primary" id="fb-save-pdf">保存为 PDF</button>' +
        '<span id="fb-msg" class="ok-msg"></span>'
      );
    },

    mergeAnswers: function (p) {
      var changed = false;
      p.questions.forEach(function (q) {
        if (q.status !== "confirmed" || !q.answer || !q.answer.trim()) return;
        var sec = p.sections.find(function (s) { return s.key === q.sectionKey; });
        if (!sec) return;
        var answer = q.answer.trim();
        if (q.stage === 1 && /（待补充/.test(sec.content)) {
          sec.content = sec.content.replace(/（待补充：[^）]*）|（待补充）/g, answer);
          changed = true;
          return;
        }
        if (sec.content.indexOf("评审确认「" + q.question + "」") >= 0) return;
        sec.content += "\n- 评审确认「" + q.question + "」：" + answer;
        changed = true;
      });
      if (changed) Store.upsertProject(p);
    },

    enhanceQuestions: function (p) {
      var self = this;
      var s = this.state;
      s.enhancing = true;
      this.setFixedBar(this.renderQuestionsBar(p));
      AI.callAi("enhance", {
        existing: p.questions,
        draftSections: p.sections,
        sections: p.sections,
        materials: p.materials,
      })
        .then(function (res) {
          var existingTexts = p.questions.map(function (q) { return q.question; });
          var fresh = (res.questions || []).filter(function (q) { return existingTexts.indexOf(q.question) < 0; });
          p.questions = p.questions.concat(fresh);
          Store.upsertProject(p);
          s.enhancing = false;
          self.updateProjectHeader(p);
          self.renderProjectBody();
          window.alert(fresh.length ? "加强追问完成：新增 " + fresh.length + " 条追问" : "加强追问完成：未发现新的遗漏点");
        })
        .catch(function (e) {
          s.enhancing = false;
          self.setFixedBar(self.renderQuestionsBar(p));
          window.alert("加强追问失败：" + (e.message || "请稍后重试"));
        });
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
      var html = Export.exportHtml(p);
      var iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
      document.body.appendChild(iframe);
      var doc = iframe.contentWindow.document;
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(function () {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(function () { document.body.removeChild(iframe); }, 2000);
      }, 400);
    },

    showModal: function (src) {
      var root = document.getElementById("modal-root");
      root.innerHTML =
        '<div class="modal-mask" id="modal-mask"><div class="modal">' +
        "<h3>原文对照（溯源）</h3>" +
        '<div style="font-size:12px;color:#666;margin-bottom:8px">来源材料：' + esc(src.materialLabel) + "</div>" +
        '<div class="snippet">' + esc(src.snippet || "（原文摘录为空）") + "</div>" +
        '<div class="row" style="justify-content:flex-end; margin-top:14px; margin-bottom:0"><button class="btn sm primary" id="modal-close">关闭</button></div>' +
        "</div></div>";
      document.getElementById("modal-close").addEventListener("click", function () { root.innerHTML = ""; });
      document.getElementById("modal-mask").addEventListener("click", function (e) {
        if (e.target.id === "modal-mask") root.innerHTML = "";
      });
    },

    downloadMd: function (p) {
      var md = Export.projectToMarkdown(p);
      var blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = p.name.replace(/[\/\\:*?"<>|]/g, "-") + ".md";
      a.click();
      URL.revokeObjectURL(url);
    },

    copyMd: function (p) {
      var self = this;
      var md = Export.projectToMarkdown(p);
      navigator.clipboard.writeText(md).then(function () {
        self.state.copied = true;
        setTimeout(function () { self.state.copied = false; }, 1600);
        if (self.state.tab === "edit") self.renderProjectBody();
      }).catch(function () {
        window.alert("复制失败，请手动选择文本复制");
      });
    },

    // ---------- 设置页 ----------

    renderSettings: function () {
      var self = this;
      var s = this.state;
      this.clearFixedBar();
      s.settings = Store.loadSettings();
      var all = Store.loadTemplates();
      s.customTemplates = all.filter(function (t) { return !Templates.DEFAULTS.some(function (d) { return d.id === t.id; }); });

      var html = '<h1 class="page-title">设置</h1>';
      html += '<div class="card"><div style="font-weight:700;margin-bottom:4px">模型配置</div>';
      html += '<div style="font-size:12.5px;color:#777;margin-bottom:12px">面向作品集演示：API Key 由服务端持有（环境变量或 Supabase Secrets），访客无需、也不应填写自己的 Key。未配置服务端 Key 时自动使用 Demo 模式。</div>';
      html += '<div class="row"><span class="field-label">模型</span><input type="text" id="set-model" placeholder="gpt-4.1-mini" value="' + esc(s.settings.model) + '"></div>';
      html += '<div class="row"><span class="field-label">服务端 Key</span><span id="server-key-status" class="tag warn">检测中…</span></div>';
      html += '<div class="row" style="margin-bottom:0"><button class="btn primary" id="save-key">保存</button><span id="key-msg" class="ok-msg"></span></div></div>';

      html += '<div class="card" style="margin-top:16px"><div style="font-weight:700;margin-bottom:4px">框架模板</div>';
      html += '<div style="font-size:12.5px;color:#777;margin-bottom:12px">每行一个章节，格式：「标题 | 撰写要求」或「标题 - 撰写要求」，要求可留空。</div>';
      all.forEach(function (t) {
        var isDefault = Templates.DEFAULTS.some(function (d) { return d.id === t.id; });
        html += '<div class="list-item"><span class="tag blue">' + t.sections.length + " 节</span>";
        html += '<span class="grow">' + esc(t.name) + (isDefault ? '<span class="tag" style="margin-left:8px">内置</span>' : "") + "</span>";
        if (!isDefault) html += '<button class="btn sm danger" data-rmtpl="' + t.id + '">删除</button>';
        html += "</div>";
      });
      html += '<div style="border-top:1px solid #eee;margin:14px 0 12px;padding-top:12px"><div style="font-weight:600;font-size:13px;margin-bottom:8px">新增自定义模板</div>';
      html += '<div class="row"><span class="field-label">模板名称</span><input type="text" id="tpl-name" placeholder="如：看板类项目" value="' + esc(s.newName) + '"></div>';
      html += '<textarea id="tpl-sections" rows="6" placeholder="1. 项目名称 | 命名规范\n2. 项目背景 | 为什么做\n3. 项目目标 | 干成什么样">' + esc(s.newSections) + "</textarea>";
      html += '<div class="row" style="margin-top:10px;margin-bottom:0"><button class="btn primary" id="save-tpl">保存模板</button><span id="tpl-msg" class="ok-msg"></span></div></div></div>';

      document.getElementById("app").innerHTML = html;

      AI.checkServerKey().then(function (has) {
        var el = document.getElementById("server-key-status");
        if (el) {
          el.className = "tag " + (has ? "ok" : "warn");
          el.textContent = has ? "已配置（服务端环境变量）" : "未配置 → 当前为 Demo 模式";
        }
      });
      document.getElementById("save-key").addEventListener("click", function () {
        s.settings.apiKey = "";
        s.settings.model = document.getElementById("set-model").value.trim();
        Store.saveSettings(s.settings);
        document.getElementById("key-msg").textContent = "已保存：Key 由服务端持有，前端不存储 Key";
        self.updateModeBadge();
      });
      document.getElementById("save-tpl").addEventListener("click", function () {
        var name = document.getElementById("tpl-name").value.trim();
        var lines = document.getElementById("tpl-sections").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
        if (!name || !lines.length) {
          document.getElementById("tpl-msg").textContent = "请填写模板名称与章节列表";
          return;
        }
        var sections = lines.map(function (line, i) {
          var parts = line.split(/[|｜\-—]/).map(function (x) { return x.trim(); });
          return { key: "custom-" + (i + 1), title: parts[0] || "章节 " + (i + 1), description: parts.slice(1).join(" / ") || "（未填写撰写要求）" };
        });
        var tpl = {
          id: Store.uid(),
          name: name,
          sections: sections,
          crossDeptDefault: true,
          prefs: Object.assign({}, Templates.DEFAULT_PREFS),
        };
        s.customTemplates.push(tpl);
        Store.saveCustomTemplates(s.customTemplates);
        document.getElementById("tpl-msg").textContent = "模板已保存，可在新建页选择";
        self.renderSettings();
      });
      document.querySelectorAll("[data-rmtpl]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          s.customTemplates = s.customTemplates.filter(function (t) { return t.id !== btn.getAttribute("data-rmtpl"); });
          Store.saveCustomTemplates(s.customTemplates);
          self.renderSettings();
        });
      });
    },
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", function () { App.init(); });
})(window);
