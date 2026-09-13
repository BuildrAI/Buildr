# Buildr 当前知识

从这里理解 Buildr 当前的产品、技术与实现位置。正式规范描述产品承诺，当前代码描述实际行为，登记配置描述身份和选择，已确认决定说明取舍；下面三类成果共同引用这些依据，不能替代它们。

| 想了解什么 | 阅读入口 | 负责什么 |
|---|---|---|
| 产品是什么，怎样使用和维护 | [解释文档](docs/README.md) | 综合说明定位、概念、架构、流程、服务与使用和运行方式 |
| 某个功能实际在哪里 | [代码地图](code-map/README.md) | 目录、模块、对象、代表方法、调用、数据归属与副作用 |
| 系统与技术关系如何连接 | [技术图](archify/index.md) | 有事实来源的图源与可查看成果，按有用视角表达关系 |

代码地图（Code Map）、技术图（Technical Diagram）和解释文档（Explanatory Documentation）可以相互引用，也可以直接依据规范、代码和配置，没有固定生成顺序。同一事实可以有不同视角的表达；相关事实没变时，不因文件版本变化机械重建。

## 从一个完整例子开始

**技能源文件如何成为可发现入口**：阅读[面向人的说明](docs/architecture/buildr-skill-system.md)，需要定位时打开[代码地图](code-map/skill-projection.md)，观察关系时打开[技术图](archify/flows/skill-projection.html)。图的[来源与表达边界](archify/flows/skill-projection.md)和[可维护图源](archify/flows/skill-projection.json)与展示一起保存。

## 当前说明之外

- [正式规范](../openspec/specs/)：产品行为承诺；冲突需核对实际实现并处理。
- [单次变更](../openspec/changes/)：提案、设计、执行清单与 `brief.md`，不是每次知识建设的前置。
- [历史、规划与文章导航](../docs/document-index.md)：按用途保留，不随代码自动重写。
- [目录整理与旧路径去向](migration.md)：历史材料中旧链接的查找入口。

## 维护范围

先从目标和事实变化定位相关成果，依据各成果自身或就近导航的覆盖、来源、边界和关联判断影响。已有明确建设授权时连续完成；范围外缺口先提出具体建议。只对实际变化选择检查，不让单项未完成阻止无关工作。具体执行方法见[当前知识维护技能](../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md)。
