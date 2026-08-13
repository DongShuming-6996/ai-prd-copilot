// Demo 生成器：无 API Key 时在浏览器端直接生成样例 PRD 与追问（同时可被 node server.js 复用）
(function (global) {
  function joinText(materials) {
    return (materials || []).map(function (m) { return m.text; }).join("\n");
  }

  function paragraphs(text) {
    return text.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function pickParagraphs(text, keywords, max) {
    max = max || 2;
    var hits = paragraphs(text).filter(function (p) {
      return keywords.some(function (k) { return p.toLowerCase().indexOf(k) >= 0; });
    });
    return hits.slice(0, max);
  }

  function pickBullets(text, keywords, max) {
    max = max || 8;
    var seen = {};
    var out = [];
    paragraphs(text).some(function (line) {
      if (keywords.some(function (k) { return line.toLowerCase().indexOf(k) >= 0; })) {
        var clean = line.replace(/^[-•*\d.、\s]+/, "").trim();
        if (clean && !seen[clean] && clean.length < 160) {
          seen[clean] = true;
          out.push(clean);
        }
      }
      return out.length >= max;
    });
    return out;
  }

  function sourceRef(materials, keywords) {
    var refs = [];
    for (var i = 0; i < (materials || []).length; i++) {
      var m = materials[i];
      if (keywords.some(function (k) { return m.text.toLowerCase().indexOf(k) >= 0; })) {
        var first = paragraphs(m.text)[0] || "";
        refs.push({ materialId: m.id, materialLabel: m.label, snippet: first.slice(0, 120) });
        break;
      }
    }
    return refs;
  }

  function isSample(materials) {
    var text = joinText(materials).toLowerCase();
    return text.indexOf("tcc-qc-20260712-018") >= 0 ||
      (text.indexOf("质检") >= 0 && text.indexOf("列表页") >= 0 && text.indexOf("上移") >= 0);
  }

  var SAMPLE_CONTENT = {
    name: "【质检】VS质检平台-列表页质检结果上移",
    background:
      "**业务链路**：车主通过电话 / AppChat / 邮件发起售后 → 每笔售后生成 case 进入 TCC 质检平台（含车架号、用户电话、聊天记录、售后内容记录）→ 自动质检产出结果 → 人工质检产出结果 → 支持复盘 / 优秀案例归档。列表页是质检员日常处理案件的主入口。\n\n**现状问题**：\n- 质检结果仅存在于详情页，列表页只展示案件基础信息，质检员需点击进入详情逐条确认结果；\n- 质检员日均 300+ 次详情页点击仅用于查看质检结果，无效操作占比约 60%；\n- 投诉 / 高危案件无法在列表层识别，存在处理超时风险；\n- 质检主管无法在列表层掌握质检通过率、待处理量与积压情况。\n\n**需求来源**：质检业务方反馈 + 业务访谈（7月15日体验优化对齐会）。",
    goal:
      "- 列表页直接展示自动质检结果与人工质检状态，质检员无需进入详情即可判断案件下一步动作；\n- 支持按质检结果筛选、排序，命中质检问题的案件高亮；\n- 质检员单案件平均处理时长下降 20%，无效点击减少 60%，投诉类案件 24h 内处理率 ≥ 95%。",
    value:
      "**定量**：人均每日无效点击 300+ 降至 120 以下；单案件处理时长下降约 20%（约节省 1.5h/人/天）；投诉类案件 24h 内处理率提升至 95%。\n\n**定性**：质检员从\"逐个点开确认结果\"变为\"列表层直接处理\"，降低操作疲劳；主管实时掌握质检全局；高危案件处理时效提升，降低二次投诉与舆情风险。",
    improvements:
      "- [P0] 现状：列表页无质检结果信息 → 改后：新增\"质检结果\"列（自动结果 + 人工状态）（Deadline：待填写）\n- [P0] 现状：仅基础筛选 → 改后：新增质检结果筛选器，支持多选（Deadline：待填写）\n- [P1] 现状：命中问题无视觉区分 → 改后：整行高亮 + 结果列红色标签（Deadline：待填写）\n- [P1] 现状：仅按时间排序 → 改后：支持按结果状态、问题等级排序（Deadline：待填写）\n- [P2] 现状：列表列固定写死 → 改后：列自定义（Deadline：二期）\n\n**动作优先级说明**：先结果列（P0）→ 筛选（P0）→ 高亮与排序（P1）→ 列自定义（P2）。Deadline 由用户填写。",
    data:
      "**是否需要跨部门协作**：是（默认开）。\n\n**BI 侧需要做什么**：\n- 合并自动质检结果表（qc_auto_result）与人工质检结果表（qc_manual_result）生成视图 qc_case_result_v；\n- 关键字段：auto_qc_result（计算逻辑：质检规则集判定；最小单位：单条 case；数据来源：qc_auto_result 表）、manual_qc_status（人工质检状态机）、qc_problem_level（严重度映射低/中/高）、ai_transfer_result（预留）。\n\n**质检侧需要做什么**：\n- 后端列表查询服务对接视图、字段映射；历史案件结果回填，输出失败清单并支持重试。\n\n**动作先后关系**：BI 先交付视图（T+3）→ 质检后端联调与回填（T+3~T+7）→ 前端并行（mock 联调）；BI 延期时后端用临时表承接。",
    backend:
      "- 列表查询接口新增返回字段：auto_qc_result、manual_qc_status、qc_problem_level；\n- 新增筛选参数（多选）与排序参数（按结果时间、问题等级）；\n- 权限过滤：质检员仅可见本组案件，主管可见全量，接口层二次校验防越权；\n- 性能：5,000 条数据规模 P95 ≤ 800ms，筛选响应 ≤ 1s；\n- 兼容性：老接口保持返回结构，新增字段不破坏现有调用方。",
    frontend:
      "- 列表页新增\"质检结果\"列（自动结果 + 人工状态双态展示）；\n- 顶部新增\"质检结果\"筛选器，与现有筛选器并存可叠加；\n- 命中质检问题案件整行浅红高亮 + 结果列红色标签；\n- 空态/加载态：结果为空显示\"—\"，接口超时展示失败态与重试按钮；\n- 涉及 UI 改动，需附设计稿与交互说明，上线前提供演示视频（链接占位）。",
    acceptance:
      "- 列表页每行正确展示自动质检结果与人工质检状态，且与详情页数据一致；\n- 筛选\"质检不通过 + 高危\"仅返回命中案件，分页总数正确；\n- 权限：质检员无法通过页面或接口看到组外案件质检结果；\n- 性能：5,000 条数据下列表接口 P95 ≤ 800ms，筛选响应 ≤ 1s；\n- 异常：自动质检未完成案件显示\"质检中\"，不落入\"通过/不通过\"筛选；\n- 存量 case 历史结果回填正确，回填失败有日志与告警；\n- 回归：现有列表功能（分页、导出、个性化筛选）不受影响。",
    test:
      "**功能点覆盖**：结果列展示、筛选（单选/多选/叠加）、命中高亮、排序、三角色权限、分页与空态、历史回填。\n\n**用例建议**：\n\n| 编号 | 前置条件 | 操作步骤 | 预期结果 | 优先级 |\n| --- | --- | --- | --- | --- |\n| TC-01 | 存在自动质检通过案件 | 加载列表页 | 显示\"通过\"，人工状态\"未开始\" | P0 |\n| TC-02 | 存在命中质检问题案件 | 筛选\"质检不通过\" | 仅返回命中案件，数量与详情页一致 | P0 |\n| TC-03 | 自动质检未完成 | 加载列表并筛选 | 显示\"质检中\"，不被筛入通过/不通过 | P0 |\n| TC-04 | 质检员账号 | 请求携带组外 case_id | 返回 403 / 结果不可见 | P0 |\n| TC-05 | 5,000 条数据 | 分页翻页 + 筛选 | P95 ≤ 800ms，无卡顿 | P1 |\n| TC-06 | 结果字段为空的历史 case | 加载列表 | 显示\"—\"，不报错 | P1 |\n\n**异常允许程度**：\n\n| 场景 | 允许程度 | 处理方式 |\n| --- | --- | --- |\n| 自动质检未完成 | 允许展示\"质检中\" | 不参与\"通过/不通过\"筛选，支持刷新 |\n| 结果字段缺失 | 允许展示\"—\" | 记录日志，不阻塞列表加载 |\n| 接口超时 / BI 视图不可用 | 不允许静默失败 | 展示失败态 + 重试按钮，触发告警 |\n| 越权访问 | 不允许 | 接口 403、前端隐藏、审计日志记录 |\n| 历史数据回填失败 | 不允许静默 | 失败清单 + 重试机制 + 告警 |",
  };

  var SAMPLE_SOURCES = {
    improvements: ["期待改进点", "支持按质检结果筛选"],
    data: ["合并成一个视图", "BI"],
    background: ["质检结果仅展示在 case 详情页", "列表页"],
    test: ["功能点覆盖", "异常"],
  };

  function sampleDraft(materials, sections) {
    return {
      name: SAMPLE_CONTENT.name,
      sections: sections.map(function (def) {
        return {
          key: def.key,
          title: def.title,
          content: SAMPLE_CONTENT[def.key] || "（待补充）",
          sources: sourceRef(materials, SAMPLE_SOURCES[def.key] || []),
        };
      }),
    };
  }

  function genericDraft(materials, sections, crossDept) {
    var text = joinText(materials);
    var nameHit = pickBullets(text, ["项目名称", "BID", "项目："], 1)[0] ||
      (paragraphs(text)[0] || "").slice(0, 30) ||
      "（未命名项目，待确认）";

    function fill(def) {
      switch (def.key) {
        case "name": return nameHit;
        case "background": {
          var ps = pickParagraphs(text, ["背景", "痛点", "现状", "问题", "由于", "业务"], 3);
          return ps.length ? ps.join("\n\n") : "（待补充：原始材料未覆盖项目背景）";
        }
        case "goal": {
          var gs = pickBullets(text, ["目标", "希望", "达到", "提升", "实现"], 5);
          return gs.length ? gs.map(function (b) { return "- " + b; }).join("\n") : "（待补充：原始材料未覆盖项目目标）";
        }
        case "value": {
          var vs = pickBullets(text, ["价值", "收益", "节省", "减少", "效率"], 5);
          return vs.length ? vs.map(function (b) { return "- " + b; }).join("\n") : "（待补充：原始材料未覆盖项目价值）";
        }
        case "improvements": {
          var bs = pickBullets(text, ["改进", "优化", "新增", "增加", "支持", "需要"], 8);
          if (!bs.length) return "（待补充：原始材料未覆盖改进点）";
          return bs.map(function (b) { return "- [P0] 现状：（待补充） → 改后：" + b + "（Deadline：待填写）"; }).join("\n");
        }
        case "data":
          return crossDept
            ? "**是否需要跨部门协作**：是（默认开，可切换）\n\n- 本组数据层需要做什么：待补充（涉及的表 / 字段 / 存储）\n- 跨部门侧（如 BI / 其他组）需要做什么：待补充\n- 两个部门的动作先后关系：待确认\n\n**字段口径**：\n\n| 字段 | 计算逻辑 | 最小单位 | 数据来源 | 关联方式 |\n| --- | --- | --- | --- | --- |\n| 待补充 | 待补充 | 待补充 | 待补充 | 待补充 |"
            : "- 本组数据层需要做什么：待补充（涉及的表 / 字段 / 存储）\n\n| 字段 | 计算逻辑 | 最小单位 | 数据来源 | 关联方式 |\n| --- | --- | --- | --- | --- |\n| 待补充 | 待补充 | 待补充 | 待补充 | 待补充 |";
        case "backend":
          return "（待补充：接口 / 服务 / 权限 / 性能等动作）";
        case "frontend":
          return "（待补充：页面 / 组件 / 交互改动；UI/UX 改动附设计稿或 demo 链接）";
        case "acceptance":
          return "（待补充：与改进点逐条对应的可验收标准，含性能 / 异常边界等量化指标）";
        case "test":
          return "**功能点覆盖**：待补充\n\n**用例建议**：\n\n| 编号 | 前置条件 | 操作步骤 | 预期结果 | 优先级 |\n| --- | --- | --- | --- | --- |\n| TC-01 | 待补充 | 待补充 | 待补充 | P0 |\n\n**异常允许程度**：待补充（允许 / 不允许 + 处理方式）";
        default:
          return "（待补充）";
      }
    }

    return {
      name: nameHit,
      sections: sections.map(function (def) {
        return {
          key: def.key,
          title: def.title,
          content: fill(def),
          sources: sourceRef(materials, ["背景", "目标", "改进", "数据", "权限", "测试"]),
        };
      }),
    };
  }

  function sampleQuestions(sections) {
    function byKey(key) { return sections.find(function (s) { return s.key === key; }); }
    function title(key, fallback) { var s = byKey(key); return s ? s.title : (fallback || "对应章节"); }
    var list = [
      [1, "name", "项目名称定为什么？（原始材料未提及）", "【质检】VS质检平台-列表页质检结果上移", title("name"), "P0", false],
      [1, "goal", "项目目标如何表述？", "列表页直接展示质检结果，支持筛选/排序/高亮，单案件处理时长 -20%", title("goal"), "P0", false],
      [1, "improvements", "各优先级对应的 Deadline 是什么？（AI 不代排）", "用户填写，示例：P0 8/14，P1 8/21，P2 二期", title("improvements"), "P0", false],
      [1, "acceptance", "验收标准按解决方案逐条编写？有无硬性指标（性能 / 回填范围）？", "按章节逐条对应，性能 P95 ≤ 800ms，回填全量", title("acceptance"), "P1", false],
      [2, "improvements", "\"质检结果\"列同时展示自动结果与人工状态，组合关系是什么？", "自动结果 × 人工状态组合展示，主次标签", title("improvements"), "P0", false],
      [2, "frontend", "筛选器单选还是多选？与现有筛选如何叠加？", "多选，与现有筛选 AND 叠加", title("frontend"), "P0", false],
      [2, "data", "qc_case_result_v 与列表主查询的关联键是什么？同一 case 多次自动质检取哪条？", "关联键 case_id，取最近一次质检结果", title("data"), "P0", true],
      [2, "data", "历史数据回填范围是全量还是近 N 天？执行窗口？", "全量，T+3 ~ T+7 分批执行", title("data"), "P1", true],
      [2, "backend", "权限中\"本组\"如何定义？跨组共享 case 怎么算？", "按业务组；共享 case 属主组可见", title("backend"), "P1", false],
      [2, "frontend", "命中高亮是整行还是仅结果列？", "整行浅红 + 结果列红色标签", title("frontend"), "P1", false],
      [2, "acceptance", "\"与详情页数据一致\"以哪个为准？数据刷新时机？", "以详情页最新结果为准，列表每次进入刷新", title("acceptance"), "P1", false],
      [2, "data", "auto_qc_result 的数据来源是什么？如何关联进入列表视图？", "来源 qc_auto_result 表；经 BI 视图合并后以 case_id 关联", title("data"), "P0", true],
      [2, "data", "qc_problem_level 严重度映射规则由谁维护？", "质检规则配置维护，待确认", title("data"), "P1", true],
    ];
    return list.map(function (item, i) {
      return {
        id: "q-" + (i + 1),
        stage: item[0],
        sectionKey: item[1],
        sectionTitle: item[4],
        impact: "§" + String(item[4]).split(" ")[0],
        question: item[2],
        suggestedAnswer: item[3],
        actionGuidance: item[3] ? "请根据建议内容补充到PRD对应章节" : "请手动填写此追问的答案",
        answer: "",
        priority: item[5],
        status: "pending",
        dataLayer: item[6],
      };
    });
  }

  function genericQuestions(sections, materials, prefs) {
    var out = [];
    var n = 0;
    function push(stage, key, question, suggested, priority, dataLayer) {
      var sec = sections.find(function (s) { return s.key === key; });
      out.push({
        id: "q-" + (++n),
        stage: stage,
        sectionKey: key,
        sectionTitle: sec ? sec.title : key,
        impact: sec ? "§" + String(sec.title).split(" ")[0] : undefined,
        question: question,
        suggestedAnswer: suggested,
        actionGuidance: suggested ? "请根据建议内容补充到PRD对应章节" : "请手动填写此追问的答案",
        answer: "",
        priority: priority,
        status: "pending",
        dataLayer: !!dataLayer,
      });
    }

    // ===== 阶段一：框架覆盖检查 =====
    // 检查每个章节是否有待补充/待填写/未命名
    sections.forEach(function (sec) {
      if (/待补充|待填写|未命名/.test(sec.content)) {
        push(1, sec.key, "原始材料未覆盖「" + sec.title + "」，请补充具体内容。", "", "P0", false);
      }
    });

    var text = joinText(materials);
    var improvements = sections.find(function (s) { return s.key === "improvements"; });
    var dataSec = sections.find(function (s) { return s.key === "data"; });
    var acceptance = sections.find(function (s) { return s.key === "acceptance"; });
    var nameSec = sections.find(function (s) { return s.key === "name"; });
    var backend = sections.find(function (s) { return s.key === "backend"; });
    var frontend = sections.find(function (s) { return s.key === "frontend"; });
    var testSec = sections.find(function (s) { return s.key === "test"; });
    var goalSec = sections.find(function (s) { return s.key === "goal"; });

    // 阶段一：Deadline 提醒
    if (improvements && prefs.askDeadline && /待填写/.test(improvements.content)) {
      push(1, "improvements", "各优先级（P0/P1/P2）对应的 Deadline 是什么？（AI 不代排，请填写）", "用户填写，示例：P0 8/14，P1 8/21，P2 二期", "P0", false);
    }

    // 阶段一：数据来源缺失提醒
    if (dataSec && prefs.askDataSource && /待补充/.test(dataSec.content)) {
      push(1, "data", "数据来源与关联方式必须明确：涉及的数据表/字段来源是什么？如何关联到系统？", "待确认：需明确数据来源系统、表名、关联键", "P0", true);
    }

    // 阶段一：项目名称
    if (nameSec && /未命名/.test(nameSec.content)) {
      push(1, "name", "项目名称定为什么？（格式：【模块】平台-改动点）", "待命名，格式示例：【质检】VS质检平台-列表页质检结果上移", "P0", false);
    }

    // 阶段一：目标量化
    if (goalSec && /待补充/.test(goalSec.content)) {
      push(1, "goal", "项目目标是否有可量化指标？（如处理时长下降 X%、转化率提升 Y%）", "待补充量化指标", "P0", false);
    }

    // ===== 阶段二：开发视角审查 =====
    // 数据层字段口径（必问）
    if (dataSec && prefs.askDataSource) {
      push(2, "data", "各字段的计算逻辑、最小单位（如单条 case / 单次请求）、数据来源分别是什么？", "待确认各字段口径", "P0", true);
      push(2, "data", "数据关联键是什么？（如 case_id / user_id），关联方式（JOIN / API）？", "待确认关联键与关联方式", "P0", true);
      push(2, "data", "同一实体存在多版本数据时，取哪个版本？（最新 / 特定时间点 / 全部）", "默认取最新版本，特殊场景需说明", "P1", true);
    }

    // 字段计算逻辑检查
    if (dataSec && prefs.checkCalcLogic && !/待补充/.test(dataSec.content || "")) {
      push(2, "data", "涉及字段的计算逻辑是否需要后端/BI 侧二次确认？", "按需确认，避免口径不一致", "P1", true);
    }

    // 后端：权限边界
    if (backend && (text.indexOf("权限") >= 0 || text.indexOf("角色") >= 0)) {
      push(2, "backend", "不同角色的权限边界如何定义？可见/可操作范围是什么？", "待确认：按角色/部门/组维度定义权限矩阵", "P0", false);
    } else if (backend) {
      push(2, "backend", "是否需要权限控制？不同角色的可见/可操作范围？", "如不涉及权限，确认无权限需求", "P1", false);
    }

    // 后端：性能指标
    if (backend && !/P95|QPS|并发|ms/.test(backend.content || "")) {
      push(2, "backend", "接口性能指标是否明确？（P95 耗时 / 并发量 / 数据规模）", "待确认：建议 P95 ≤ 800ms，数据量级 ≤ N 条", "P1", false);
    }

    // 前端：交互细节
    if (frontend && !/筛选|排序|分页|高亮/.test(frontend.content || "")) {
      push(2, "frontend", "页面交互细节是否已明确？（筛选方式、排序规则、分页、高亮策略）", "待确认交互细节", "P1", false);
    }

    // 前端：空态/加载态/错误态
    if (frontend) {
      push(2, "frontend", "空态 / 加载态 / 错误态的展示方式是否已定义？", "待确认：— / 骨架屏 / 失败+重试按钮", "P1", false);
    }

    // 异常分支处理
    if (testSec || acceptance) {
      var targetKey = testSec ? "test" : "acceptance";
      push(2, targetKey, "异常分支如何处理？（超时 / 失败 / 空数据 / 越权访问）", "待确认：不允许静默失败，失败展示+重试+告警", "P0", false);
    }

    // 验收标准量化
    if (acceptance && /待补充/.test(acceptance.content || "")) {
      push(2, "acceptance", "验收标准是否有可量化指标？（性能 / 时间 / 成功率 / 回填范围）", "待确认：建议逐条对应改进点，含量化阈值", "P0", false);
    }

    // 兼容性与回归
    if (acceptance) {
      push(2, "acceptance", "兼容性与回归范围如何界定？现有功能是否受影响？", "待确认：列出不受影响的现有功能清单", "P1", false);
    }

    // 模糊表述检查
    if (/建议|大概|可能|约|左右|差不多/.test(text)) {
      push(2, "background", "材料中出现模糊表述（建议/大概/约/左右），请确认实际口径与准确值。", "待确认，替换为准确数字", "P1", false);
    }

    // 上线与灰度策略
    if (!/灰度|发布|上线|回滚/.test(text)) {
      push(2, improvements ? "improvements" : "acceptance", "上线节奏与灰度策略是什么？是否需要回滚方案？", "待确认：建议分阶段上线，保留回滚能力", "P2", false);
    }

    return out;
  }

  function generateDraft(materials, sections, crossDept) {
    if (isSample(materials)) return sampleDraft(materials, sections);
    return genericDraft(materials, sections, crossDept);
  }

  function generateQuestions(draftSections, materials, prefs) {
    if (isSample(materials)) return sampleQuestions(draftSections);
    return genericQuestions(draftSections, materials, prefs || { askDataSource: true, askDeadline: true, checkCalcLogic: false });
  }

  var ENHANCE_POOL = [
    [2, "backend", "性能指标是否明确（接口耗时 / 数据量级 / 并发）？", "待确认", "P1", false],
    [2, "acceptance", "兼容性与回归范围如何界定？", "待确认", "P1", false],
    [2, "test", "异常分支（超时 / 失败 / 空数据 / 权限）如何处理？", "待确认", "P0", false],
    [2, "backend", "是否有审计 / 日志留存要求？", "待确认", "P2", false],
    [2, "data", "数据回填 / 迁移的执行窗口与回滚方案？", "待确认", "P1", true],
    [2, "acceptance", "上线节奏与灰度策略？", "待确认", "P2", false],
    [2, "data", "同一实体多版本数据如何兼容？", "待确认", "P1", true],
    [2, "frontend", "操作反馈与空态 / 加载态是否覆盖？", "待确认", "P1", false],
    [2, "improvements", "各改进点是否有前后端依赖关系？联调顺序？", "待确认", "P1", false],
    [2, "data", "数据变更的通知机制？（MQ / 回调 / 轮询）", "待确认", "P1", true],
    [2, "backend", "接口是否有幂等性要求？重复请求如何处理？", "待确认", "P1", false],
    [2, "frontend", "是否涉及多端（PC/平板/手机）适配？", "待确认", "P2", false],
  ];

  function generateEnhance(existing, sections, materials) {
    var existingTexts = (existing || []).map(function (q) { return q.question; });
    var out = [];
    ENHANCE_POOL.forEach(function (item, i) {
      if (existingTexts.indexOf(item[2]) >= 0) return;
      var sec = sections.find(function (s) { return s.key === item[1]; });
      out.push({
        id: "enh-" + (i + 1),
        stage: item[0],
        sectionKey: item[1],
        sectionTitle: sec ? sec.title : item[1],
        impact: sec ? "§" + String(sec.title).split(" ")[0] : undefined,
        question: item[2],
        suggestedAnswer: item[3],
        actionGuidance: item[3] ? "请根据建议内容补充到PRD对应章节" : "请手动填写此追问的答案",
        answer: "",
        priority: item[4],
        status: "pending",
        dataLayer: item[5],
      });
    });
    return out;
  }

  var Demo = {
    generateDraft: generateDraft,
    generateQuestions: generateQuestions,
    generateEnhance: generateEnhance,
    isSample: isSample,
  };
  global.Demo = Demo;
  if (typeof module !== "undefined" && module.exports) module.exports = Demo;
})(typeof window !== "undefined" ? window : globalThis);
