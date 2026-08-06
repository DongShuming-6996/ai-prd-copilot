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

  function topLevelCount(sections) {
    var set = {};
    (sections || []).forEach(function (s) {
      var m = String(s.title || "").match(/^\s*(\d+)/);
      if (m) set[m[1]] = true;
    });
    var n = Object.keys(set).length;
    return n || (sections ? sections.length : 0);
  }

  var STATUS_TEXT = { draft: "草稿", editing: "编辑中", done: "已完成" };

  var App = {
    state: {
      projects: [],
      project: null,
      activeKey: "",
      selectedSections: [],
      newName: "",
      newSecTitle: "",
      newSecDesc: "",
    },

    init: function () {
      var self = this;
      window.addEventListener("hashchange", function () { self.route(); });
      this.route();
    },

    route: function () {
      this.updateNav();
      var hash = location.hash || "#/";
      if (hash.indexOf("#/project/") === 0) {
        this.renderProject(decodeURIComponent(hash.slice(10)));
      } else if (hash === "#/new") {
        this.renderNew();
      } else {
        this.renderList();
      }
    },

    updateNav: function () {
      var hash = location.hash || "#/";
      var map = {
        "nav-home": hash === "#/" || hash === "",
        "nav-new": hash.indexOf("#/new") === 0,
      };
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

    // ---------- 列表页（管理） ----------

    renderList: function () {
      var self = this;
      this.clearFixedBar();
      this.state.projects = Store.loadProjects();
      var projects = this.state.projects;

      var html = '<div class="row" style="justify-content:space-between; margin-bottom:14px">';
      html += '<h1 class="page-title" style="margin:0">我的 PRD</h1>';
      html += '<a href="#/new" class="btn primary">+ 新建 PRD</a></div>';

      if (!projects.length) {
        html += '<div class="empty"><p style="margin:0 0 12px">还没有项目</p>';
        html += '<a href="#/new" class="btn primary">创建第一份 PRD</a></div>';
      } else {
        projects.forEach(function (p) {
          var filled = p.sections.filter(function (s) { return (s.content || "").trim(); }).length;
          html += '<div class="card project-card">';
          html += '<div class="meta"><a href="#/project/' + encodeURIComponent(p.id) + '" class="name">' + esc(p.name) + "</a>";
          html += '<div class="sub">' + fmtTime(p.updatedAt) + " · " + topLevelCount(p.sections) + " 节 · 已填 " + filled + "/" + p.sections.length + "</div></div>";
          html += '<span class="tag ' + (p.status === "done" ? "ok" : p.status === "editing" ? "blue" : "") + '">' + (STATUS_TEXT[p.status] || "草稿") + "</span>";
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

    // ---------- 新建页 ----------

    renderNew: function () {
      var self = this;
      this.clearFixedBar();
      var s = this.state;
      var defaults = Templates.DEFAULTS[0].sections;
      var customs = Store.loadCustomSections();
      if (!s.selectedSections.length) {
        s.selectedSections = defaults
          .map(function (sec) { return sec.key; })
          .concat(customs.map(function (sec) { return sec.key; }));
      }
      var allSections = defaults.concat(customs);

      var html = '<h1 class="page-title">新建 PRD 项目</h1><div class="cols">';
      html += '<div class="col wide"><div class="card">';
      html += '<div style="font-weight:600; margin-bottom:8px">① 项目名称</div>';
      html += '<input type="text" id="proj-name" placeholder="如：【美团-搜索】酒吧搜词推荐页头图改版" value="' + esc(s.newName) + '">';
      html += "</div></div>";

      html += '<div class="col wide"><div class="card">';
      html += '<div style="font-weight:600; margin-bottom:4px">② 选择框架章节（默认全选）</div>';
      html += '<div style="font-size:12.5px;color:#66707f;margin-bottom:10px">按需勾选要填写的章节，未勾选的不出现在 PRD 中</div>';
      html += '<div class="sec-grid">';
      defaults.forEach(function (sec) {
        var on = s.selectedSections.indexOf(sec.key) >= 0;
        html += '<button type="button" class="sec-btn' + (on ? " on" : "") + '" data-sec="' + sec.key + '" title="' + esc(sec.description || "") + '">' + esc(sec.title) + "</button>";
      });
      customs.forEach(function (sec) {
        var on = s.selectedSections.indexOf(sec.key) >= 0;
        html += '<button type="button" class="sec-btn' + (on ? " on" : "") + '" data-sec="' + sec.key + '" title="' + esc(sec.description || "自定义章节") + '">' + esc(sec.title) + "</button>";
        html += '<button type="button" class="sec-btn-del" data-delsec="' + sec.key + '" title="删除自定义章节">✕</button>';
      });
      html += '<button type="button" class="sec-btn add-custom" id="add-custom-sec">+ 自定义</button>';
      html += "</div><div id=" + '"custom-form"' + "></div>";
      html += "</div></div>";

      html += '<div class="col"><div class="card">';
      html += '<button class="btn primary block" id="create-btn" style="margin-top:0">创建项目</button>';
      html += '<div class="hint">创建后进入编辑器，按章节填写，内容自动保存到本地浏览器</div>';
      html += "</div></div></div>";

      document.getElementById("app").innerHTML = html;

      document.getElementById("proj-name").addEventListener("input", function (e) { s.newName = e.target.value; });
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
          '<input type="text" id="cus-desc" placeholder="撰写要求（可选）">' +
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
      document.getElementById("create-btn").addEventListener("click", function () { self.createProject(); });
    },

    createProject: function () {
      var s = this.state;
      var defaults = Templates.DEFAULTS[0].sections;
      var customs = Store.loadCustomSections();
      var allSections = defaults.concat(customs);
      var sections = allSections
        .filter(function (sec) { return s.selectedSections.indexOf(sec.key) >= 0; })
        .map(function (sec) { return { key: sec.key, title: sec.title, description: sec.description || "", content: "" }; });
      if (!sections.length) {
        window.alert("请至少选择一个框架章节");
        return;
      }
      var name = s.newName.trim() || "未命名项目";
      var now = Date.now();
      var project = {
        id: Store.uid(),
        name: name,
        createdAt: now,
        updatedAt: now,
        sections: sections,
        status: "draft",
      };
      Store.upsertProject(project);
      s.newName = "";
      s.selectedSections = [];
      location.hash = "#/project/" + encodeURIComponent(project.id);
    },

    // ---------- 项目页（编辑器） ----------

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

      var html = '<div class="row" style="justify-content:space-between">';
      html += '<div style="min-width:0; flex:1">';
      html += '<input class="name-input" id="proj-name" value="' + esc(project.name) + '">';
      html += '<div id="proj-meta" style="margin-top:6px; display:flex; gap:8px; flex-wrap:wrap"></div>';
      html += "</div>";
      html += '<div class="row" style="margin:0">';
      html += '<a href="#/" class="btn sm">返回列表</a>';
      html += '<button class="btn sm" id="toggle-status">' + (project.status === "done" ? "重新编辑" : "标记完成") + "</button>";
      html += "</div></div>";
      html += '<div class="cols" style="margin-top:16px"><div class="col tight"><div class="sidenav"><div class="title">章节导航</div>';
      project.sections.forEach(function (sec) {
        var filled = (sec.content || "").trim().length > 0;
        html += '<div class="item" data-jump="' + sec.key + '"><span class="t">' + esc(sec.title) + "</span>";
        html += filled ? '<span class="tag ok">✓</span>' : '<span class="tag">空</span>';
        html += "</div>";
      });
      html += "</div></div>";
      html += '<div class="col wide" id="sec-list">';
      project.sections.forEach(function (sec) {
        html += '<div class="edit-block" id="sec-' + sec.key + '">';
        html += '<div class="edit-title">' + esc(sec.title) + "</div>";
        if (sec.description) html += '<div class="edit-desc">' + esc(sec.description) + "</div>";
        html += '<textarea data-sec="' + sec.key + '" placeholder="在此填写本章节内容……" rows="' + Math.min(16, Math.max(6, (sec.content || "").split("\n").length + 3)) + '">' + esc(sec.content) + "</textarea>";
        html += "</div>";
      });
      html += "</div></div>";
      document.getElementById("app").innerHTML = html;

      document.getElementById("proj-name").addEventListener("input", function (e) {
        project.name = e.target.value || "未命名项目";
        Store.upsertProject(project);
      });
      document.getElementById("toggle-status").addEventListener("click", function () {
        project.status = project.status === "done" ? "editing" : "done";
        Store.upsertProject(project);
        self.updateMeta(project);
        this.textContent = project.status === "done" ? "重新编辑" : "标记完成";
      });
      document.querySelectorAll("[data-jump]").forEach(function (el) {
        el.addEventListener("click", function () {
          var key = el.getAttribute("data-jump");
          self.state.activeKey = key;
          var target = document.getElementById("sec-" + key);
          if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
      document.querySelectorAll("textarea[data-sec]").forEach(function (ta) {
        ta.addEventListener("input", function () {
          var key = ta.getAttribute("data-sec");
          var sec = project.sections.find(function (x) { return x.key === key; });
          if (sec) {
            sec.content = ta.value;
            Store.upsertProject(project);
            self.updateMeta(project);
            var item = document.querySelector('.sidenav .item[data-jump="' + key + '"] .tag');
            if (item) {
              item.className = "tag" + (ta.value.trim() ? " ok" : "");
              item.textContent = ta.value.trim() ? "✓" : "空";
            }
          }
        });
      });
      this.updateMeta(project);
      this.setFixedBar(
        '<span class="muted" style="font-size:12px">内容已自动保存到本地浏览器</span>' +
        '<span class="spacer"></span>' +
        '<button class="btn" id="fb-save-draft">保存草稿</button>' +
        '<button class="btn" id="fb-save-word">保存为 Word</button>' +
        '<button class="btn primary" id="fb-save-pdf">保存为 PDF</button>' +
        '<span id="fb-msg" class="ok-msg"></span>'
      );
      var barMsg = document.getElementById("fb-msg");
      document.getElementById("fb-save-draft").addEventListener("click", function () {
        Store.upsertProject(project);
        if (barMsg) {
          barMsg.textContent = "草稿已保存 ✓";
          setTimeout(function () { barMsg.textContent = ""; }, 2000);
        }
      });
      document.getElementById("fb-save-word").addEventListener("click", function () { self.downloadWord(project); });
      document.getElementById("fb-save-pdf").addEventListener("click", function () { self.printPdf(project); });
    },

    updateMeta: function (p) {
      var el = document.getElementById("proj-meta");
      if (!el) return;
      var filled = p.sections.filter(function (s) { return (s.content || "").trim(); }).length;
      el.innerHTML =
        '<span class="tag">' + topLevelCount(p.sections) + " 节</span>" +
        '<span class="tag">已填 ' + filled + " / " + p.sections.length + "</span>" +
        '<span class="tag ' + (p.status === "done" ? "ok" : p.status === "editing" ? "blue" : "") + '">' + (STATUS_TEXT[p.status] || "草稿") + "</span>";
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
