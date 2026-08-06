(function (global) {
  var PREFIX = "ai_prd_copilot.";

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (e) {
      // storage unavailable
    }
  }

  var Store = {
    uid: function () {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    },
    loadProjects: function () { return read("projects", []); },
    saveProjects: function (list) { write("projects", list); },
    getProject: function (id) { return this.loadProjects().find(function (p) { return p.id === id; }); },
    upsertProject: function (p) {
      var list = this.loadProjects();
      var i = list.findIndex(function (x) { return x.id === p.id; });
      p.updatedAt = Date.now();
      if (i >= 0) list[i] = p; else list.unshift(p);
      this.saveProjects(list);
    },
    deleteProject: function (id) {
      this.saveProjects(this.loadProjects().filter(function (p) { return p.id !== id; }));
    },
    loadTemplates: function () {
      var custom = read("templates", []);
      return Templates.DEFAULTS.concat(custom);
    },
    saveCustomTemplates: function (list) {
      write("templates", list.filter(function (t) {
        return !Templates.DEFAULTS.some(function (d) { return d.id === t.id; });
      }));
    },
    loadCustomSections: function () { return read("custom_sections", []); },
    saveCustomSections: function (list) { write("custom_sections", list); },
    loadUsage: function () { return read("usage", { count: 0, day: "" }); },
    saveUsage: function (u) { write("usage", u); },
    loadSettings: function () { return read("settings", { apiKey: "", model: "" }); },
    saveSettings: function (s) { write("settings", s); },
  };

  global.Store = Store;
})(window);
