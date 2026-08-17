# Buildr 文档说明

本文说明 Buildr 产品文档的分工。它不是 Agent 运行时规则，也不是产品事实源。

## 当前入口

| 文档 | 作用 |
|------|------|
| [../README.md](../README.md) | 产品入口、快速开始和文档导航 |
| [buildr-product.md](buildr-product.md) | 产品理解：定位、核心模型、工作资产、协作方式和后续方向 |
| [manual/README.md](manual/README.md) | 团队成员与协作者日常使用 Buildr + Agent 的简明操作手册 |
| [architecture/buildr-skill-system.md](architecture/buildr-skill-system.md) | Buildr Skill 的来源、组合、能力依赖、runtime 投射与 Doctor/receipt 分层 |
| [architecture/buildr-project-declaration-system.md](architecture/buildr-project-declaration-system.md) | Project Preparation/Verification 声明、Declaration Intake、Task 选择、专业 authority 与非 Node 边界 |
| [architecture/progressive-business-modeling.md](architecture/progressive-business-modeling.md) | 从数据模型、领域模型和业务行为出发渐进推进业务设计的当前共识 |
| [architecture/service-architecture.md](architecture/service-architecture.md) | Buildr Service 工程目录、业务与产品模块、技术分层、Resources、Tools、Web 宿主与 Bootstrap 的组织共识 |
| [../openspec/knowledge/overview.md](../openspec/knowledge/overview.md) | 当前已实现事实入口，导航术语、架构、流程和 Service 说明 |
| [../openspec/specs/](../openspec/specs/) | 规范性产品行为契约 |
| [roadmap/](roadmap/) | 尚未实现的产品方向和详细设计候选，不作为当前事实或实施契约 |
| [release-checklist.md](../services/buildr/docs/release-checklist.md) | 发布准备和验证清单 |
| [cli-reference.md](../services/buildr/docs/cli-reference.md) | 公开 CLI 命令、参数边界和 canonical onboarding |
| [cli-architecture.md](../services/buildr/docs/cli-architecture.md) | CLI 内部分层、依赖方向、兼容和维护验证边界 |
| [agent-runtime-adapters.md](../services/buildr/docs/agent-runtime-adapters.md) | 已接入 Agent runtime adapter 的支持矩阵、接入路径、刷新方式、限制和证据状态 |
| [agent-runtime-adapter-contribution.md](../services/buildr/docs/agent-runtime-adapter-contribution.md) | 新 Agent runtime adapter 的证据采集、分诊、设计、实现和验收流程 |
| [agent-runtime-adapter-research-prompt.md](../services/buildr/docs/agent-runtime-adapter-research-prompt.md) | 可直接交给目标 Agent 执行的 runtime 能力调查 Prompt |
| [known-limitations.md](../services/buildr/docs/known-limitations.md) | 当前公开试用范围和已知限制 |
| [archive/](archive/) | 历史参考，不作为当前事实源 |

## 内容归属

| 内容类型 | 放置位置 |
|----------|----------|
| 产品入口、最小心智模型、快速开始 | `README.md` |
| 产品定位、为什么、核心概念、协作模型 | `docs/buildr-product.md` |
| 已经实现的当前事实 | `openspec/knowledge/overview.md` 及其导航的结构化 knowledge |
| 历史任务页面（只作历史旁证，不再创建或维护） | `openspec/knowledge/task-boards/*.html`、`openspec/knowledge/task-cockpits/*.html` |
| MUST / SHOULD 级产品行为 | `openspec/specs/` |
| 计划型产品变更 | `openspec/changes/` |
| 尚未进入实现的长期产品方向 | `docs/roadmap/` |
| 发布检查和公开发布准备 | `services/buildr/docs/release-checklist.md` |
| 公开 CLI reference、内部维护架构、adapter 接入指南与已知限制 | `services/buildr/docs/cli-reference.md`、`services/buildr/docs/cli-architecture.md`、`services/buildr/docs/agent-runtime-adapter-contribution.md`、`services/buildr/docs/known-limitations.md` |
| 旧设计、旧草案、迁移前原文、历史模板 | `docs/archive/` |

## Knowledge 规则

进入 `openspec/knowledge/` 的常规 current-state 文档必须是当前事实：

- 当前已经实现。
- Agent 或维护者需要据此判断现状。
- 能和 `openspec/specs/` 的能力域对齐。
- 未来可能随实现变化而更新。

`knowledge` 不写产品价值主张、愿景、历史原因、采用场景或路线图。

`openspec/knowledge/task-boards/` 与 `openspec/knowledge/task-cockpits/` 是原地保留的历史任务页面：

- 保持现有文件的原路径和原内容，不迁移、不重写、不删除或重新接管。
- 只作为历史过程和来源线索，不再承担当前任务工作状态或导航职责。
- 当前 Task、Parent/Child、Development、Review 与 Verification 状态必须通过各专业 Application/read model、Buildr Web、canonical specs 和有效 evidence 核实。
- 不创建新的 `task-boards/*.html` 或 `task-cockpits/*.html`。

## Roadmap 规则

`docs/roadmap/` 保存仍有价值但尚未实现的产品方向：

- 必须显著说明内容尚未实现，不是当前事实、行为契约、Rule、Skill 或 Agent runtime 资产。
- 不能用现在时把未来方向描述为 Buildr 已提供的能力。
- 方向准备进入实现时，必须创建独立 OpenSpec change；Roadmap 文档不替代 proposal、design、delta specs 或 tasks。
- 方向实现、放弃或被替代后，应同步维护 Roadmap 索引，避免陈旧规划被误读。

## Archive 规则

`docs/archive/` 放历史参考。归档文档不是当前 Buildr 产品事实源，默认不参与 Agent 当前任务判断。

归档文档顶部必须标注：

```md
> Archived historical note. Not a current Buildr product source of truth.
```

## 维护约定

- 新增当前产品说明时，优先更新 `docs/buildr-product.md`。
- 新增当前实现事实时，按影响更新 `openspec/knowledge/overview.md`、`glossary.md`、`architecture/`、`flows/` 或 `services/` 中真正相关的资产；不生成空文档。
- 正式 Task 的协调和进度使用 Task Record、Parent/Child、各专业公开 read model、Buildr Web 与对话汇报；不要创建第二份 Board authority。既有 `task-boards/` 与 `task-cockpits/` 页面保持原路径和原内容，只作为历史旁证。
- 新增规范性行为时，更新 `openspec/specs/` 或创建 OpenSpec change。
- 新增尚未进入实现的详细产品方向时，维护 `docs/roadmap/` 并保持非当前事实声明。
- 新增 Agent runtime adapter 前，先按 `services/buildr/docs/agent-runtime-adapter-contribution.md` 取得目标 Agent 的版本化证据；进入实现后仍必须创建独立 OpenSpec change。
- Components、Commands collections 与 OpenSpec 契约门禁的当前边界写入 current state，产品含义写入产品说明，MUST 行为保留在 OpenSpec specs；未来的 Project/Service Component、远程 registry 和 Hook 不得提前写成当前事实。
- 重命名、归档或删除文档时，同步更新本文。
