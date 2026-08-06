(function (global) {
  var PREFIX = "ai_prd_copilot.";

  function normalizeProject(p) {
    p = p || {};
    return {
      id: p.id || "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2),
      name: p.name || "未命名项目",
      businessLine: Array.isArray(p.businessLine) ? p.businessLine : [],
      dept: Array.isArray(p.dept) ? p.dept : [],
      priority: p.priority || "",
      tags: Array.isArray(p.tags) ? p.tags : [],
      status: p.status || "draft",
      sections: Array.isArray(p.sections) ? p.sections : [],
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || Date.now(),
    };
  }

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
    loadProjects: function () { return read("projects", []).map(normalizeProject); },
    saveProjects: function (list) { write("projects", list); },
    getProject: function (id) { return normalizeProject(this.loadProjects().find(function (p) { return p.id === id; })); },
    upsertProject: function (p) {
      var list = this.loadProjects();
      var norm = normalizeProject(p);
      norm.updatedAt = Date.now();
      var i = list.findIndex(function (x) { return x.id === norm.id; });
      if (i >= 0) list[i] = norm; else list.unshift(norm);
      this.saveProjects(list);
      return norm;
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

    // ---------- 附件（IndexedDB 存 Blob，不占 localStorage 配额） ----------
    attachSave: function (id, blob) {
      return openDB().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction("files", "readwrite");
          tx.objectStore("files").put(blob, id);
          tx.oncomplete = res;
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    attachGet: function (id) {
      return openDB().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction("files", "readonly");
          var r = tx.objectStore("files").get(id);
          r.onsuccess = function () { res(r.result); };
          r.onerror = function () { rej(r.error); };
        });
      });
    },
    attachRemove: function (id) {
      return openDB().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction("files", "readwrite");
          tx.objectStore("files").delete(id);
          tx.oncomplete = res;
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
  };

  var ATTACH_DB_NAME = "prd-studio.attachments";
  var dbPromise = null;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(ATTACH_DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore("files");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  global.Store = Store;
})(window);
