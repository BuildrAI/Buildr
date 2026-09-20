# 面向人的解释文档

这些文档回答“是什么、概念如何理解、整体如何组成、业务如何运转、各部分负责什么，以及怎样使用和运行”。按阅读价值建设，不要求每类、每个模块都有独立文件。

| 种类 | 当前具体文档 | 覆盖范围与表达边界 |
|---|---|---|
| 产品概览 | [产品概览](overview.md)、[当前能力入口](capabilities.md) | 前者综合解释定位、协作与核心模型；后者快速导航当前能力，不作为第二套规范 |
| 核心概念与术语 | [术语表](glossary.md)；概念关系见概览与产品架构 | 稳定名称、定义、作用域和区别；不为一次任务建立私有术语表 |
| 产品架构 | [产品架构](architecture/product.md) | 角色、能力、领域和产品边界；规划明确标注 |
| 技术架构 | [技术架构](architecture/technical.md)、[服务分层](architecture/service-architecture.md) | 系统组成、模块、依赖和数据归属；实现细节链接地图 |
| 知识建设与维护 | [架构说明](architecture/knowledge-maintenance.md)、[阅读用词说明](knowledge-maintenance-terms.md) | 文中直接引用图和地图，来源变化后按影响维护 |
| 对象关系与代码定位 | [项目、服务与代码库如何协作](architecture/project-service-repositories.md) | 解释共享引用、真实代码位置与修改影响 |
| 完整任务系统 | [从用户对话到任务收尾](architecture/task-system.md) | 工作台（Workbench）、工作摘要（Work Context）答复闭环、独立记录、实施验证、交付与自举激活；列明当前规范残留 |
| 专题架构 | [技能体系](architecture/buildr-skill-system.md)、[项目声明](architecture/buildr-project-declaration-system.md)、[通用测试与验证](architecture/workspace-testing-and-verification-framework.md)、[Product 验证框架](architecture/verification-framework.md)、[门禁分类](architecture/governance-gate-taxonomy.md) | 分别解释对应机制；通用测试模型与 Buildr 产品自身测试框架保持不同范围 |
| 关键流程 | [变更处理](flows/openspec-change-lifecycle.md)、[任务交付](flows/task-closeout.md)、[父任务协调](flows/task-parent-coordination.md)、[每日演进](flows/project-daily-progress.md)、[发布与恢复](flows/open-source-release.md) | 从目标到结果的参与者、关键顺序、异常和边界；不重复完整调用实现 |
| 服务说明 | [Buildr](services/buildr.md)、[Buildr Web](services/buildr-web.md) | 服务职责、对外能力、数据和依赖；模块专题按价值放入对应架构说明 |
| 使用指南 | [日常使用](guides/usage.md) | 人如何表达目标、参与判断并查看与接续成果 |
| 开发与运行指南 | [开发与运行入口](guides/development-and-operations.md) | 连接实际开发、验证、配置、启动、发布和排障材料；不复制命令参考 |
| 已确认设计方法 | [渐进式业务建模](architecture/progressive-business-modeling.md) | 解释已确认的建模方法与适用条件，不描述软件新增功能或替代执行规则 |

## 事实来源与关联

这是上述文件共同的来源与范围导航。每份文件的具体链接补充细节，代表模块另有逐对象来源；目录迁移不等于重新验证产品全部行为。

- 概览、能力入口、术语和产品架构：依据[核心规则](../../services/buildr/resources/workspace/AGENTS.md)、[正式规范](../../openspec/specs/)、[服务登记](../../services/manifest.yml)和相应模块实现；技术细节从[代码地图](../code-map/README.md)进入。
- 技术架构、服务分层和服务说明：依据 [Buildr 实现](../../services/buildr/src/)、[前端实现](../../services/buildr-web/src/)、各自 `package.json`、服务登记与正式规范；排除外部宿主和生产环境的未观察状态。
- 技能体系：依据[技能投射代码地图](../code-map/skill-projection.md)列出的函数、源文件和配置，关联[技术图](../archify/flows/skill-projection.html)。
- 项目声明及两份测试说明：依据[项目测试地图](../../verification.yml)、[声明接收技能](../../services/buildr/resources/workspace/skills/buildr/declaration-intake/SKILL.md)、[验证技能](../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)、[验证实现](../../services/buildr/src/modules/project-testing/)和[任务验证实现](../../services/buildr/src/modules/task/application/task-verification-application.ts)；框架说明不证明某次测试通过。
- 门禁分类与业务建模方法：依据文内规范和已确认设计决定；用于解释局部约束或设计取舍，不代替当前任务授权。
- 变更处理：依据[OpenSpec 模块](../../services/buildr/src/modules/openspec/)与[组件贡献](../../services/buildr/resources/workspace/components/buildr/openspec/)。
- 任务交付与父任务协调：依据[任务实现](../../services/buildr/src/modules/task/)和文内对应技能；排除当前未观察的任务状态。
- 每日演进：依据[每日演进模块](../../services/buildr/src/modules/task/daily-progress/)；运行数据是本机事实，不进入这些文档。
- 发布与恢复：依据文内指向的发布规范、工程入口和专用技能；说明流程不构成发布授权或完成证明。
- 日常使用和开发运行指南：依据以上当前文档与具体命令参考；操作前核对本次环境和权限。

只修改事实确实影响的内容；摘录应回指来源，复杂关系可直接引用地图或图表。[统一知识入口](../README.md)连接三类成果，[历史和规划](../../docs/document-index.md)保留不同语境。
