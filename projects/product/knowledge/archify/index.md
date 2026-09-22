# Archify 技术图

这里保存 Buildr Product 的当前态可视化投影（visual projection）。技术图服务于人和智能体理解系统，不替代事实源，也不承担 OpenSpec 规范或变更台账职责。

[返回文字架构入口](../docs/architecture/index.md)

## 当前入口

- [数据领域与事实归属](data/buildr-data-domains.html)：领域关系阅读总图；[图源](data/buildr-data-domains.json)、[依据](data/buildr-data-domains.md)、[数据设计正文](../docs/architecture/buildr-data-design.md)。
- [数据库实体关系图（Entity Relationship Diagram，ERD）](data/workspace-sqlite-erd.html)：真实表、字段与关联；[Graphviz 图源](data/workspace-sqlite-erd.dot.txt)、[矢量图](data/workspace-sqlite-erd.svg)、[依据](data/workspace-sqlite-erd.md)。本图使用 Graphviz 表达表字段和鸟脚表示法（Crow’s Foot），不是 Archify 架构图，也不改变现有生成器。

- [任务系统：完整过程与角色职责](flows/task-system.html)：人、智能体（Agent）与 Buildr 的完整协作；[图源](flows/task-system.json)、[事实依据](flows/task-system.md)。
- [需求、方案与实施授权](flows/task-system-planning.html)：方案阅读、人的答复与主动接续；[图源](flows/task-system-planning.json)、[依据](flows/task-system-planning.md)。
- [实现审查与代码交付](flows/task-system-delivery.html)：实施、两类检查、验收授权与实际交付；[图源](flows/task-system-delivery.json)、[依据](flows/task-system-delivery.md)。
- [自举激活与安全善后](flows/task-self-bootstrap.html)：唯一执行器的条件动作、提交与成功标准；[图源](flows/task-self-bootstrap.json)、[事实依据](flows/task-self-bootstrap.md)。
- [技能源文件到可发现入口](flows/skill-projection.html)：本次有界示范；[图源](flows/skill-projection.json)、[逐节点关系来源与边界](flows/skill-projection.md)。

- [Buildr 系统全景图源码](system/buildr-system-overview.json)：Archify 的结构化图表源码，依据当前 Product 代码、目录结构、OpenSpec 和已登记关系编写。
- [Buildr 系统全景图](system/buildr-system-overview.html)：由源码生成的可浏览 HTML 图表。
- [能力、数据与副作用流源码](flows/capability-data-responsibility.json)：按命名能力、数据 owner 与副作用边界组织的结构化图表源码。
- [能力、数据与副作用流](flows/capability-data-responsibility.html)：用于追踪关键调用、写入保护和跨模块 Binder 的可浏览 HTML 图表。

JSON 是可维护源，HTML 是可重建投影。两者应保持同名、同目录，并在源码或结构发生影响图表语义的变化时一并更新；普通代码改动不自动要求重画图表。

## 依据与边界

技术图的依据是当前代码及其目录/模块登记、`openspec/specs/` 的规范性行为和 `knowledge/` 中已经整理的当前态模型。图表中的证据路径用于帮助回看依据，但不把图表变成第二事实源。

`knowledge/` 统一代码地图、技术图与 `knowledge/docs/` 解释文档；`docs/` 保留历史、规划、文章和导航。当前知识维护技能统一承接按范围的建设与维护，不提供后台监听或自动漂移重建。

## 预留维度

以下目录作为后续按需扩展的维护位置，当前不要求填充图表：

- `product/`：产品视角
- `application/`：应用与能力视角
- `data/`：数据与流转视角
- `technology/`：技术与部署视角
- `flows/`：流程、时序和生命周期视角

图表旁的 `*.visual-check.json`、`*.visual-check.html` 与检查截图是生成和视觉检查证据，不是新的知识事实源。

本轮两图已通过 9/9 展示级检查，错误与警告均为 0；四个桌面尺寸的边界检查通过。已人工查看 1440×900 浅色与 2048×1320 深色截图，未发现节点、卡片或连线遮挡。自动视觉报告仍保留 `visualReview: pending`，人工查看结论不伪装成自动检查结果。

## 知识建设与维护

[职责图](flows/knowledge-maintenance.html) · [图源](flows/knowledge-maintenance.json) · [来源说明](flows/knowledge-maintenance.md) · [实现地图](../code-map/knowledge-maintenance.md)。本图表达建设指导、事实依据、维护执行与只读呈现，工作协作不代表后台自动调用。

## 项目、服务与代码库

[引用关系示意](flows/project-service-repositories.html) · [图源](flows/project-service-repositories.json) · [事实依据](flows/project-service-repositories.md) · [架构文章](../docs/architecture/project-service-repositories.md)。
