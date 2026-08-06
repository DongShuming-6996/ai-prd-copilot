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
    if ((m = h.match(/^#\/edit\/([^/]+)$/))) return { page: "edit", id: decodeURIComponent(m[1]) };
    if ((m = h.match(/^#\/preview\/([^/]+)$/))) return { page: "preview", id: decodeURIComponent(m[1]) };
    if ((m = h.match(/^#\/project\/([^/]+)$/))) return { page: "project", id: decodeURIComponent(m[1]) };
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
      this.showSplash();
    },

    wireExit: function () {
      var btn = document.getElementById("btn-exit");
      if (!btn) return;
      var self = this;
      btn.addEventListener("click", function () {
        if (!window.confirm("确认退出并清除你创建的 PRD？系统模拟的 50 条会保留。")) return;
        var tasks = [];
        Store.getUserProjects().forEach(function (p) {
          (p.attachments || []).forEach(function (a) {
            tasks.push(Store.attachRemove(a.id).catch(function () {}));
          });
        });
        Promise.all(tasks).then(function () {
          Store.clearUserProjects();
          window.alert("已清除你创建的 PRD，系统模拟数据保留。");
          self.route();
        });
      });
    },

    showSplash: function () {
      if (Store.isSplashDone()) return;
      var mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.innerHTML =
        '<div class="modal"><h3>欢迎使用 PRD Studio</h3>' +
        '<p style="margin:10px 0;color:#cfd6e2;line-height:1.9">为了方便您的预览体验，您不需要完成登录或注册，系统中已有模拟的 50 条 PRD，方便您可以直接尝试筛选查找 PRD 或者写新的 PRD。</p>' +
        '<div class="row" style="justify-content:flex-end;margin-top:16px;margin-bottom:0"><button class="btn primary" id="splash-ok">确认</button></div></div>';
      document.body.appendChild(mask);
      document.getElementById("splash-ok").addEventListener("click", function () {
        Store.setSplashDone();
        document.body.removeChild(mask);
      });
    },

    route: function () {
      this.updateNav();
      var r = parseHash();
      if (r.page === "new") this.renderStep1(r.id);
      else if (r.page === "edit") this.renderStep2(r.id);
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

      var html = '<h1 class="page-title">我的 PRD</h1>';
      html += '<div class="card filter-bar">';
      html += '<div class="row" style="margin-bottom:10px"><input type="text" id="f-keyword" placeholder="搜索名称 / 内容 / 标签…" value="' + esc(f.keyword) + '" style="flex:1">';
      html += '<button class="btn sm" id="f-clear">清除筛选</button></div>';
      html += '<div class="row"><span class="flabel">时间</span><div class="chips" id="f-time">' + chipHTML([["all", "全部"], ["7", "近7天"], ["30", "近30天"], ["90", "近90天"]], [f.time], "time") + "</div></div>";
      html += '<div class="row"><span class="flabel">业务线</span><div class="chips" id="f-business">' + chipHTML(DICTS.businessLines, f.business, "business") + "</div></div>";
      html += '<div class="row"><span class="flabel">协作部门</span><div class="chips" id="f-dept">' + chipHTML(DICTS.depts, f.dept, "dept") + "</div></div>";
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
      var list = this.state.projects.filter(function (p) { return self.matches(p); });
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
          html += '<a href="#/edit/' + encodeURIComponent(p.id) + '" class="btn sm">编辑</a>';
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
          form.id = p.id;
          form.name = p.name;
          form.businessLine = p.businessLine.slice();
          form.dept = p.dept.slice();
          form.priority = p.priority;
          form.tags = p.tags.slice();
          form.selectedSections = p.sections.map(function (x) { return x.key; });
        }
      } else {
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
      var tagList = Object.keys(tagSet);

      var html = '<h1 class="page-title">' + (id ? "配置框架（返回修改）" : "新建 PRD · 第 1 步 / 共 3 步") + "</h1>";
      html += '<div class="card">';
      html += '<div class="edit-title">① 基本信息</div>';
      html += '<div class="row"><span class="flabel">项目名称 *</span><input type="text" id="s-name" placeholder="如：【美团-搜索】酒吧搜词推荐页头图改版" value="' + esc(form.name) + '"></div>';
      html += '<div class="row"><span class="flabel">业务线</span><div class="chips" id="s-business">' + chipHTML(DICTS.businessLines, form.businessLine, "business") + "</div></div>";
      html += '<div class="row"><span class="flabel">协作部门</span><div class="chips" id="s-dept">' + chipHTML(DICTS.depts, form.dept, "dept") + "</div></div>";
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
        '<a href="#/" class="btn">取消</a>' +
        '<span class="spacer"></span>' +
        '<span class="muted" style="font-size:12px">下一步将进入逐节填写</span>' +
        '<button class="btn primary" id="fb-step1-next">下一步 →</button>'
      );
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

    // ---------- 3. 创建向导 Step 2：逐节填写 + 附件 ----------

    renderStep2: function (id) {
      var self = this;
      var p = Store.getProject(id);
      if (!p) {
        this.clearFixedBar();
        document.getElementById("app").innerHTML = '<div class="card">项目不存在。<a href="#/" class="btn sm" style="margin-left:10px">返回列表</a></div>';
        return;
      }
      if (p.simulated) {
        this.renderDetail(id);
        return;
      }
      this.state.project = p;
      var filled = this.filled(p);

      var html = '<div class="row" style="justify-content:space-between">';
      html += '<div style="min-width:0;flex:1"><input class="name-input" id="e-name" value="' + esc(p.name) + '">';
      html += '<div id="e-meta" style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap"></div></div>';
      html += '<div class="muted" style="font-size:12.5px">第 2 步 / 共 3 步 · 逐节填写</div></div>';
      html += '<div class="cols" style="margin-top:16px"><div class="col tight"><div class="sidenav"><div class="title">章节导航</div>';
      p.sections.forEach(function (sec) {
        var ok = (sec.content || "").trim().length > 0;
        html += '<div class="item" data-jump="' + sec.key + '"><span class="t">' + esc(sec.title) + "</span>";
        html += ok ? '<span class="tag ok">✓</span>' : '<span class="tag">空</span>';
        html += "</div>";
      });
      html += "</div></div>";
      html += '<div class="col wide"><div id="e-sections">';
      p.sections.forEach(function (sec) {
        html += '<div class="edit-block" id="sec-' + sec.key + '">';
        html += '<div class="edit-title">' + esc(sec.title) + "</div>";
        if (sec.description) html += '<div class="edit-desc">' + esc(sec.description) + "</div>";
        html += '<textarea data-sec="' + sec.key + '" placeholder="在此填写本章节内容……" rows="' + Math.min(16, Math.max(6, (sec.content || "").split("\n").length + 3)) + '">' + esc(sec.content) + "</textarea>";
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
      document.getElementById("app").innerHTML = html;

      document.getElementById("e-name").addEventListener("input", function (e) { p.name = e.target.value || "未命名项目"; Store.upsertProject(p); });
      document.querySelectorAll("textarea[data-sec]").forEach(function (ta) {
        ta.addEventListener("input", function () {
          var key = ta.getAttribute("data-sec");
          var sec = p.sections.find(function (x) { return x.key === key; });
          if (sec) {
            sec.content = ta.value;
            Store.upsertProject(p);
            self.updateStep2Meta(p);
            var tag = document.querySelector('.sidenav .item[data-jump="' + key + '"] .tag');
            if (tag) { tag.className = "tag" + (ta.value.trim() ? " ok" : ""); tag.textContent = ta.value.trim() ? "✓" : "空"; }
          }
        });
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
      this.updateStep2Meta(p);

      this.setFixedBar(
        '<button class="btn danger" id="fb-discard">放弃此 PRD</button>' +
        '<button class="btn" id="fb-save">保存草稿</button>' +
        '<button class="btn" id="fb-back">返回上一步</button>' +
        '<span class="spacer"></span>' +
        '<span id="fb-msg" class="ok-msg"></span>' +
        '<button class="btn primary" id="fb-next">下一步 →</button>'
      );
      var msg = document.getElementById("fb-msg");
      document.getElementById("fb-save").addEventListener("click", function () {
        Store.upsertProject(p);
        msg.textContent = "草稿已保存 ✓";
        setTimeout(function () { msg.textContent = ""; }, 2000);
      });
      document.getElementById("fb-discard").addEventListener("click", function () { self.discardProject(p); });
      document.getElementById("fb-back").addEventListener("click", function () { location.hash = "#/new?id=" + encodeURIComponent(p.id); });
      document.getElementById("fb-next").addEventListener("click", function () { location.hash = "#/preview/" + encodeURIComponent(p.id); });
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
        var id = Store.uid();
        return Store.attachSave(id, file).then(function () {
          p.attachments.push({ id: id, name: file.name, size: file.size, type: file.type || "" });
        });
      }).filter(Boolean);
      Promise.all(tasks).then(function () {
        Store.upsertProject(p);
        if (errs.length) window.alert("以下文件未添加：" + errs.join("；"));
        self.renderStep2(p.id);
      }).catch(function () { window.alert("附件保存失败"); });
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
      var html = '<div class="row" style="justify-content:space-between">';
      html += '<h1 class="page-title" style="margin:0">' + esc(p.name) + "</h1>";
      html += '<div class="muted" style="font-size:12.5px">第 3 步 / 共 3 步 · 预览</div></div>';
      html += '<div class="card"><div class="meta-row">';
      (p.businessLine || []).forEach(function (b) { html += '<span class="tag blue">' + esc(b) + "</span>"; });
      (p.dept || []).forEach(function (d) { html += '<span class="tag">' + esc(d) + "</span>"; });
      if (p.priority) html += '<span class="tag ' + (p.priority === "P0" ? "red" : p.priority === "P1" ? "warn" : "") + '">' + esc(p.priority) + "</span>";
      (p.tags || []).forEach(function (t) { html += '<span class="tag ok">' + esc(t) + "</span>"; });
      html += "</div></div>";
      html += '<div class="card preview-content" style="margin-top:14px">';
      p.sections.forEach(function (sec) {
        html += "<h2>" + esc(sec.title) + "</h2>";
        html += Export.renderContent(sec.content);
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
        '<button class="btn" id="pv-back">← 返回上一步</button>' +
        '<button class="btn" id="pv-md">导出 Markdown</button>' +
        '<button class="btn" id="pv-word">导出 Word</button>' +
        '<button class="btn" id="pv-pdf">导出 PDF</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn primary" id="pv-done">完成</button>'
      );
      document.getElementById("pv-back").addEventListener("click", function () { location.hash = "#/edit/" + encodeURIComponent(p.id); });
      document.getElementById("pv-md").addEventListener("click", function () { self.downloadMarkdown(p); });
      document.getElementById("pv-word").addEventListener("click", function () { self.downloadWord(p); });
      document.getElementById("pv-pdf").addEventListener("click", function () { self.printPdf(p); });
      document.getElementById("pv-done").addEventListener("click", function () {
        p.status = "done";
        Store.upsertProject(p);
        location.hash = "#/project/" + encodeURIComponent(p.id);
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
        html += '<a href="#/edit/' + encodeURIComponent(p.id) + '" class="btn sm">编辑</a>';
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
        html += Export.renderContent(sec.content);
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
  };

  global.App = App;
  document.addEventListener("DOMContentLoaded", function () { App.init(); });
})(window);
