// 系统模拟材料清单（15 份），内容从 sample-materials/ 目录按需加载
(function (global) {
  "use strict";

  var SAMPLE_LIST = [
    { id: "sm-01", file: "需求报告-质检结果运营管理看板需求说明.md", label: "需求报告-质检看板需求说明", desc: "质检结果运营管理看板需求说明，含背景、目标、功能范围、优先级" },
    { id: "sm-02", file: "会议纪要-01-看板项目立项对齐会.md", label: "会议纪要-看板立项对齐会", desc: "看板项目立项对齐会纪要，含结论与风险" },
    { id: "sm-03", file: "会议纪要-02-指标口径与数据字典评审会.md", label: "会议纪要-指标口径评审会", desc: "指标口径与数据字典评审，含争议点与行动项" },
    { id: "sm-04", file: "会议纪要-03-看板交互原型评审会.md", label: "会议纪要-交互原型评审会", desc: "交互原型评审结论与遗留问题" },
    { id: "sm-05", file: "会议纪要-04-跨部门数据链路与排期确认会.md", label: "会议纪要-数据链路排期会", desc: "跨部门数据链路与排期确认" },
    { id: "sm-06", file: "历史PRD-01-质检列表页筛选与结果上移V1.0.md", label: "历史PRD-列表页筛选V1.0", desc: "质检列表页筛选与结果上移 PRD（已上线）" },
    { id: "sm-07", file: "历史PRD-02-质检详情页优化V1.2.md", label: "历史PRD-详情页优化V1.2", desc: "质检详情页优化 PRD（已上线）" },
    { id: "sm-08", file: "历史PRD-03-人工质检任务分配中心V2.0.md", label: "历史PRD-任务分配中心V2.0", desc: "人工质检任务分配中心 PRD（已上线）" },
    { id: "sm-09", file: "数据字典-质检结果核心指标字段口径.md", label: "数据字典-指标字段口径V0.9", desc: "质检结果核心指标字段口径定义" },
    { id: "sm-10", file: "用户访谈-质检组长与运营主管访谈摘要.md", label: "用户访谈-质检组长与运营", desc: "质检组长与运营主管访谈摘要" },
    { id: "sm-11", file: "用户旅程图-质检主管日常运营动线.md", label: "用户旅程图-质检主管动线", desc: "质检主管日常运营动线与机会点" },
    { id: "sm-12", file: "竞品参考-同行业质检看板功能对标.md", label: "竞品参考-质检看板对标", desc: "同行业质检看板功能对标分析" },
    { id: "sm-13", file: "项目周报-看板项目第二周进展.md", label: "项目周报-看板第二周进展", desc: "看板项目第二周进展与风险" },
    { id: "sm-14", file: "运营评估-看板使用与质检指标季度分析报告.md", label: "运营评估-季度指标分析", desc: "Q2质检指标与看板使用分析" },
    { id: "sm-15", file: "运营评估-质检异常率专项分析.md", label: "运营评估-异常率专项分析", desc: "质检异常率上升原因拆解分析" },
  ];

  // 缓存已加载的材料内容
  var cache = {};

  function getList() {
    return SAMPLE_LIST;
  }

  function getById(id) {
    for (var i = 0; i < SAMPLE_LIST.length; i++) {
      if (SAMPLE_LIST[i].id === id) return SAMPLE_LIST[i];
    }
    return null;
  }

  async function loadContent(id) {
    if (cache[id]) return cache[id];
    var meta = getById(id);
    if (!meta) throw new Error("材料不存在: " + id);
    try {
      var resp = await fetch("sample-materials/" + encodeURIComponent(meta.file));
      if (!resp.ok) throw new Error("加载失败: " + resp.status);
      var text = await resp.text();
      cache[id] = text;
      return text;
    } catch (e) {
      throw new Error("加载材料失败: " + (e.message || "未知错误"));
    }
  }

  global.SampleMaterials = {
    getList: getList,
    getById: getById,
    loadContent: loadContent,
  };
})(window);
