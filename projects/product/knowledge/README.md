# Buildr 当前知识

从这里理解 Buildr 当前的产品、技术与实现位置。正式规范描述产品承诺，当前代码描述实际行为，登记配置描述身份和选择，已确认决定说明取舍；下面三类成果共同引用这些依据，不能替代它们。

| 想了解什么 | 阅读入口 | 负责什么 |
|---|---|---|
| 产品是什么，怎样使用和维护 | [解释文档](docs/README.md) | 综合说明定位、概念、架构、流程、服务与使用和运行方式 |
| 某个功能实际在哪里 | [代码地图](code-map/README.md) | 目录、模块、对象、代表方法、调用、数据归属与副作用 |
| 系统与技术关系如何连接 | [技术图](archify/index.md) | 有事实来源的图源与可查看成果，按有用视角表达关系 |

代码地图（Code Map）、技术图（Technical Diagram）和解释文档（Explanatory Documentation）可以相互引用，也可以直接依据规范、代码和配置，没有固定生成顺序。同一事实可以有不同视角的表达；相关事实没变时，不因文件版本变化机械重建。

## 从理解目标开始

网页默认从整体认识进入，主题目录沿系统组成、任务协作、数据、测试与验证、知识维护继续展开。层次与默认主题由同一份[局部索引](index.yml)表达；主题内可阅读说明和视图，全部资料保留检索入口。

**看全貌**：阅读[Buildr 整体认识](docs/overview.md)，先掌握业务目的、人和智能体（Agent）的职责，以及业务目标、工作方法和可接续成果三组关系，再按问题深入专业资料。

**跟一次工作**：阅读[从需求讨论到任务收尾](docs/architecture/task-system.md)，理解关键过程、人的决定、实际完成与记录的区别，以及当前组合结束边界；文中复用职责总图并连接[实现地图](code-map/task-system.md)。

**知识建设与维护**：先读[架构说明](docs/architecture/knowledge-maintenance.md)，文中引用[职责图](archify/flows/knowledge-maintenance.html)和[实现地图](code-map/knowledge-maintenance.md)。[局部阅读关联](index.yml)让网页使用同一份成果正文。

**技能源文件如何成为可发现入口**：阅读[面向人的说明](docs/architecture/buildr-skill-system.md)，需要定位时打开[代码地图](code-map/skill-projection.md)，观察关系时打开[技术图](archify/flows/skill-projection.html)。图的[来源与表达边界](archify/flows/skill-projection.md)和[可维护图源](archify/flows/skill-projection.json)与展示一起保存。

**从业务目标找到代码**：阅读[项目、服务与代码库如何协作](docs/architecture/project-service-repositories.md)，从职责与修改影响理解引用模型，再看文中关系图和实现地图。

**从数据理解系统**：阅读[数据全景与领域设计](docs/architecture/buildr-data-design.md)，先理解原始事实、关联和存储边界，再对照[数据库表设计](docs/architecture/buildr-database-tables.md)、[实体关系图（Entity Relationship Diagram，ERD）](archify/data/workspace-sqlite-erd.html)与[本机数据说明](docs/architecture/buildr-local-data.md)。

**项目与服务测试验证框架**：阅读[Buildr 如何引导测试建设与使用](docs/architecture/workspace-testing-and-verification-framework.md)，了解从零建设、多服务差异、稳定入口声明、检查选择与分范围报告；Buildr 自身是采用实例，进一步查看[产品测试架构](docs/architecture/verification-framework.md)、[测试建设与使用图](archify/flows/verification-framework.html)、[实现地图](code-map/verification-framework.md)与[上下文复用](docs/guides/node-test-context-runtime.md)。

## 当前说明之外

- [正式规范](../openspec/specs/)：产品行为承诺；冲突需核对实际实现并处理。
- [单次变更](../openspec/changes/)：提案、设计、执行清单与 `brief.md`，不是每次知识建设的前置。
- [历史、规划与文章导航](../docs/document-index.md)：按用途保留，不随代码自动重写。
- [目录整理与旧路径去向](migration.md)：历史材料中旧链接的查找入口。

## 维护范围

先从目标和事实变化定位相关成果，依据各成果自身或就近导航的覆盖、来源、边界和关联判断影响。已有明确建设授权时连续完成；范围外缺口先提出具体建议。只对实际变化选择检查，不让单项未完成阻止无关工作。具体执行方法见[当前知识维护技能](../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md)。
