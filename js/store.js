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
      simulated: Boolean(p.simulated),
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || Date.now(),
      // AI 相关字段
      materials: Array.isArray(p.materials) ? p.materials : [],
      questions: Array.isArray(p.questions) ? p.questions : [],
      usedDemo: Boolean(p.usedDemo),
      crossDept: p.crossDept !== undefined ? Boolean(p.crossDept) : true,
      prefs: p.prefs || { askDataSource: true, askDeadline: true, checkCalcLogic: false },
      // 内部缓存标记
      _lastMatHash: p._lastMatHash || "",
      _lastConfirmHash: p._lastConfirmHash || "",
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

  // ---------- 系统模拟数据（确定性生成，覆盖所有筛选项） ----------

  function seededRng(seed) {
    var t = seed >>> 0;
    return function () {
      t = (t * 1664525 + 1013904223) >>> 0;
      return t / 4294967296;
    };
  }

  var SEED_NAMES = [
    "搜索词推荐页头图改版", "交易订单列表性能优化", "BI 看板字段口径统一", "权限系统角色矩阵重构",
    "质检平台列表页结果上移", "推荐流排序策略迭代", "数据报表导出中心", "账号体系多端登录",
    "优惠券核销链路优化", "商家入驻流程重构", "客服工单流转提速", "支付对账异常告警",
    "内容审核策略升级", "营销活动会场搭建", "搜索联想词个性化", "首页金刚区改版",
    "会员等级权益调整", "订单取消退款流程", "物流轨迹同步优化", "推荐冷启动策略",
    "门店营业时间配置化", "发票开具流程线上化", "用户隐私协议更新", "消息推送中心建设",
    "秒杀活动限流方案", "搜索排序可解释性", "店铺评分体系重构", "优惠券发放风控",
    "数据分析看板权限", "商家经营报告", "订单状态机重构", "多语言国际化支持",
    "无障碍访问优化", "小程序性能优化", "App 冷启动速度优化", "埋点体系升级",
    "用户反馈工单中心", "客服机器人知识库", "门店评价体系改版", "配送时效预测",
    "商家申诉流程", "退款原因分析看板", "关键词搜索联想优化", "支付方式扩展",
    "登录态安全加固", "活动奖品库存管理", "会员积分规则重构", "搜索历史记录管理",
    "隐私授权管理", "数据字典管理平台",
  ];

  var SEED_CONTENT = {
    name: "系统模拟 PRD 示例",
    background: "【模拟数据】业务现状与痛点：当前流程链路长、效率低，需要整体优化以提升转化与体验。",
    goal: "【模拟数据】目标指标：核心转化率提升 20%，操作效率提升，体验指标达标。",
    value: "【模拟数据】业务价值：降本增效 + 用户体验提升，可量化收益见指标。",
    improvements: "【模拟数据】改进点：\n- [P1] 现状：流程繁琐 → 改后：一键化操作（Deadline：待填写）",
    data: "【模拟数据】数据层：本组数据与跨部门（BI）协作，字段口径与数据来源需对齐。",
    backend: "【模拟数据】后端动作：接口 / 服务 / 权限 / 性能调整。",
    frontend: "【模拟数据】前端动作：页面与交互调整，涉及 UI 改动附设计稿。",
    acceptance: "【模拟数据】验收标准：功能可验收，性能与异常边界达标。",
    test: "【模拟数据】测试说明：功能点覆盖 + 用例建议 + 异常允许程度。",
  };

  var SEED_TAGS = ["新增功能", "迭代优化", "Bug修复", "技术重构", "数据需求", "体验优化", "合规", "国际化", "性能优化", "安全加固"];

  function buildSeed() {
    var rng = seededRng(20260806);
    var now = Date.now();
    var defaults = Templates.DEFAULTS[0].sections;
    var lines = Templates.DICTS.businessLines;
    var depts = Templates.DICTS.depts;
    var prios = Templates.DICTS.priorities;
    var statuses = ["draft", "editing", "done"];
    return SEED_NAMES.map(function (name, i) {
      var fillCount = Math.floor(rng() * 9);
      var sections = defaults.map(function (def, j) {
        return {
          key: def.key,
          title: def.title,
          description: def.description || "",
          content: j < fillCount ? (SEED_CONTENT[def.key] || "（模拟数据）示例内容。") : "",
        };
      });
      var updatedAt = now - Math.floor(rng() * 90) * 864e5 - Math.floor(rng() * 864e5);
      var t1 = SEED_TAGS[i % SEED_TAGS.length];
      var t2 = SEED_TAGS[(i * 7 + 3) % SEED_TAGS.length];
      return {
        id: "seed-" + (i + 1),
        name: "系统模拟" + (i + 1) + "：" + name,
        businessLine: [lines[i % lines.length]],
        dept: [depts[i % depts.length]],
        priority: prios[i % prios.length],
        tags: t1 === t2 ? [t1] : [t1, t2],
        status: statuses[i % statuses.length],
        sections: sections,
        attachments: [],
        createdAt: updatedAt - Math.floor(rng() * 5) * 864e5,
        updatedAt: updatedAt,
        simulated: true,
      };
    });
  }

  var Store = {
    uid: function () {
      if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
      return Math.random().toString(36).slice(2) + Date.now().toString(36);
    },
    loadUserProjects: function () { return read("projects", []).map(normalizeProject); },
    saveUserProjects: function (list) { write("projects", list); },
    loadProjects: function () { return buildSeed().concat(this.loadUserProjects()); },
    saveProjects: function (list) {
      this.saveUserProjects(list.filter(function (p) { return !p.simulated; }));
    },
    getProject: function (id) {
      return this.loadProjects().find(function (p) { return p.id === id; });
    },
    upsertProject: function (p) {
      var norm = normalizeProject(p);
      if (norm.simulated) return norm; // 模拟数据只读
      norm.updatedAt = Date.now();
      var list = this.loadUserProjects();
      var i = list.findIndex(function (x) { return x.id === norm.id; });
      if (i >= 0) list[i] = norm; else list.unshift(norm);
      this.saveUserProjects(list);
      return norm;
    },
    deleteProject: function (id) {
      this.saveUserProjects(this.loadUserProjects().filter(function (p) { return p.id !== id; }));
    },
    getUserProjects: function () { return this.loadUserProjects(); },
    clearUserData: function () {
      // 退出时清除该用户创建的全部数据：PRD（含标签）、自定义章节/业务线/协作部门/框架模板、AI设置、用量计数
      ["projects", "templates", "custom_sections", "custom_business", "custom_dept", "settings", "usage"].forEach(function (k) {
        try { localStorage.removeItem(PREFIX + k); } catch (e) {}
      });
    },

    // ---------- 设置 ----------
    loadSettings: function () {
      return read("settings", { model: "", apiKey: "" });
    },
    saveSettings: function (settings) {
      write("settings", settings || {});
    },

    // ---------- 浏览器端 AI 用量计数 ----------
    getUsage: function () {
      return read("usage", { count: 0 });
    },
    setUsage: function (usage) {
      write("usage", usage || { count: 0 });
    },
    incrementUsage: function () {
      var u = this.getUsage();
      u.count = (u.count || 0) + 1;
      this.setUsage(u);
      return u;
    },
    usageRemaining: function () {
      var limit = (typeof window !== "undefined" && window.AI_USAGE_LIMIT) ? window.AI_USAGE_LIMIT : 5;
      return Math.max(0, limit - (this.getUsage().count || 0));
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
    loadCustomBusiness: function () { return read("custom_business", []); },
    saveCustomBusiness: function (list) { write("custom_business", list); },
    loadCustomDept: function () { return read("custom_dept", []); },
    saveCustomDept: function (list) { write("custom_dept", list); },

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
    clearAttachments: function () {
      // 退出时清空该用户上传的附件（IndexedDB）
      return openDB().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction("files", "readwrite");
          tx.objectStore("files").clear();
          tx.oncomplete = res;
          tx.onerror = function () { rej(tx.error); };
        });
      }).catch(function () {});
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
