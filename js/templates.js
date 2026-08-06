(function (global) {
  var DEFAULT_SECTIONS = [
    { key: "name", title: "1. 项目名称", description: "命名规范：【模块】平台-改动点，示例：【质检】VS质检平台-列表页质检结果上移" },
    { key: "background", title: "2. 项目背景", description: "说清楚为什么做：业务痛点 / 老板指示 / 竞品变化 / 业务链路现状" },
    { key: "goal", title: "3. 项目目标", description: "干成什么样，达到什么目的（尽量可量化）" },
    { key: "value", title: "4. 项目价值", description: "定性 + 定量：降本增效 / 体验提升 / 风险降低" },
    { key: "improvements", title: "5. 项目改进点", description: "从什么改成什么，含优先级（P0/P1/P2）与 Deadline，业务能看懂" },
    { key: "data", title: "6.1 数据层", description: "是否跨部门协作 + 本组 / 跨部门各需要做什么 + 动作先后关系" },
    { key: "backend", title: "6.2 后端层", description: "后端需要怎么动作（接口 / 服务 / 权限 / 性能）" },
    { key: "frontend", title: "6.3 前端层", description: "前端需要怎么动作；UI/UX 改动附设计稿 / demo 链接" },
    { key: "acceptance", title: "7. 验收标准", description: "与改进点对应，给开发看的可验收描述（含性能 / 异常边界）" },
    { key: "test", title: "8. 测试说明", description: "功能点 + 用例建议 + 异常情况允许程度" },
  ];

  var DEFAULT_PREFS = { askDataSource: true, askDeadline: true, checkCalcLogic: false };

  var DICTS = {
    businessLines: ["搜索", "推荐", "交易", "内容", "增长", "数据"],
    depts: ["BI", "后端", "前端", "测试", "视觉", "算法", "数据"],
    priorities: ["P0", "P1", "P2", "P3"],
  };

  var PRESET_TAGS = ["新增功能", "迭代优化", "Bug修复", "技术重构", "数据需求", "体验优化"];

  var DEFAULTS = [
    { id: "qc-8", name: "质检标准 8 节", sections: DEFAULT_SECTIONS, crossDeptDefault: true, prefs: Object.assign({}, DEFAULT_PREFS) },
    {
      id: "simple-5",
      name: "简洁 5 节",
      sections: [
        { key: "name", title: "1. 项目名称", description: "项目命名" },
        { key: "background", title: "2. 项目背景", description: "为什么做" },
        { key: "goal", title: "3. 项目目标", description: "干成什么样" },
        { key: "solution", title: "4. 解决方案", description: "数据 / 后端 / 前端动作" },
        { key: "test", title: "5. 测试说明", description: "功能点 + 用例 + 异常" },
      ],
      crossDeptDefault: false,
      prefs: Object.assign({}, DEFAULT_PREFS),
    },
  ];

  function findTemplate(id) {
    return DEFAULTS.find(function (t) { return t.id === id; }) || DEFAULTS[0];
  }

  global.Templates = {
    DEFAULTS: DEFAULTS,
    DEFAULT_PREFS: DEFAULT_PREFS,
    findTemplate: findTemplate,
    DICTS: DICTS,
    PRESET_TAGS: PRESET_TAGS,
  };
})(window);
