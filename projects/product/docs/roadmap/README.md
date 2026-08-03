# Buildr Roadmap 资料

本目录保存仍有价值的 Buildr 产品方向，以及少量跨阶段交付跟踪文档。未实现内容用于保留设计意图和帮助后续探索，不是当前产品承诺，也不是已经批准的实施计划；跟踪文档中明确标记为“已交付并生效”的里程碑仍须以 canonical specs、current-state knowledge 和实现为准。

## 与产品事实的边界

| 内容 | 权威位置 |
|------|----------|
| 产品入口、定位和后续方向摘要 | [`README.md`](../../README.md) 与 [`docs/buildr-product.md`](../buildr-product.md) |
| 已实现的当前事实 | [`openspec/knowledge/overview.md`](../../openspec/knowledge/overview.md) |
| MUST / SHOULD 级行为契约 | [`openspec/specs/`](../../openspec/specs/) |
| 已进入实施评审的计划型变更 | [`openspec/changes/`](../../openspec/changes/) |
| 历史参考 | [`docs/archive/`](../archive/) |

Roadmap 文档不是 Rule、Skill、Agent runtime 资产或当前能力说明，不能直接指导 Agent 假设对应功能已经可用。某个方向准备实现时，必须另行创建 OpenSpec change，收敛需求、设计、delta specs 和 tasks；实现完成后再按事实更新 current-state knowledge 与 canonical specs。

## 当前方向资料

- [任务生命周期架构讨论与交付跟踪](task-lifecycle-architecture.md)：以正常任务推进过程为主线，记录 Workspace Foundation、Task Triage、Environment、Development、Finish 及辅助能力的目标边界，并通过文末表格跟踪逐模块交付；P0.1 Task Record、P0.2 Task Environment、P0.3 Task Review Result 与 P0.4 Task Verification Result 已交付并生效，下一独立模块为 P0.5 Task Development / Candidate，仍须通过窄 OpenSpec Change 审查、实现和验证后才能成为 retained 能力。
- [Agent 时代的工作基础设施](agent-work-infrastructure.md)：以 Agent 为语义与执行中心，说明 Enterprise、多 Workspace、外部数据源、三类交互界面，以及 OpenHands、ACP、Multica、OpenClacky 等生态能力如何拆分到 Buildr、Agent 和可选运行设施。
- [Agent 自编排与上下文接续](agent-context-orchestration.md)：Agent 按任务跨 Workspace 检索并动态加载 Rules、Skills 和工具，自行维护 Task DAG；Buildr 只提供工作资产与可接续状态。重要性 t0，紧急性 t1。
- [历史角色能力拆解](agent-roles/)：早期岗位化职责草案；只作为动态 Rules、Skills、Packages 和能力契约的拆解素材，不构成固定 Agent 身份。
- [原型开发能力设想](prototype-development.md)：编码式交互原型流程候选，尚未作为 Buildr Skill、CLI 或受管工作流实现。
- [Workspace Assets 独立版本化方向](workspace-assets-versioning.md)：当前继续随 CLI package 发布，未来按触发条件评估版本化 tarball 与独立同步协议。

Roadmap 方向如果被放弃、替代或实现，应同步维护本索引，避免陈旧资料继续暗示当前能力。
