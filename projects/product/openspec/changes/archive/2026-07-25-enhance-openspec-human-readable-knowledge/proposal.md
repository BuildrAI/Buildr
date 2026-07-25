## Why

OpenSpec 1.6.0 已能用 proposal、design、specs 和 tasks 可靠对齐规范与实现，但这些技术产物不足以让普通用户快速理解一个 Change，也没有机制把已归档变更持续收敛为项目当前的架构、核心流程、Service 说明和统一术语。现在需要在不建立第二套事实源、不修改外部 OpenSpec Skills 的前提下，补齐面向人的变更入口和面向人、Agent 共用的当前认知治理闭环。

本变更不包含破坏性变更。

## What Changes

- 为正式 OpenSpec Change 增加 Buildr 管理的 `brief.md`，用背景、目标、用户与角色、核心流程、关键变化、影响风险和验收摘要提供人类可读入口；它只投影并组织标准 artifacts 中的事实，不成为第二份规范来源。
- 建立 Project 当前认知的信息架构与权威边界，按真实影响逐步维护项目概览、产品架构、技术架构、核心流程、Service 说明和项目术语表，不机械生成空文档。
- 提供 `buildr.terminology-governance/v1` capability contract 和默认 Skill，使 Agent 能查找 canonical glossary、识别同义词/歧义/中英不一致并只追问影响长期语义与责任边界的问题。
- 提供 `buildr.current-knowledge-maintenance/v1` capability contract 和默认 Skill，通过 assess、reconcile、inspect 三类结果证据，把 Change 影响分类、当前认知更新和收尾检查接入 OpenSpec 生命周期。
- 通过 OpenSpec Component contribution 和 capability dependency 组合外部 `openspec-*` Skills；保持外部 Skill 源可独立升级，不在其源码中调用或硬编码 Buildr 自有 Skill。
- 将当前认知维护放在最终验证和归档之前：propose 评估影响、apply 落实维护任务、sync 前收敛当前事实、task-finish 检查一致性；archive 只移动已经对齐的 Change。
- 扩展 Change 只读模型与本机应用详情页，优先展示生命周期/进度和人类可读 Brief，再提供 proposal、design、specs、tasks 等技术 artifacts。
- 明确定义 Work Information Space、Workspace、Work Assets、Context、Task Context 与 Context Window 的边界，特别说明“位于 Buildr Workspace”不等于“被 Buildr 治理”，并将 Buildr Product 的真实当前事实迁入新的知识结构。

## Capabilities

### New Capabilities
- `human-readable-change-brief`: 定义 Buildr companion `brief.md` 的内容、权威边界、生命周期、一致性要求和人类可读用途。
- `terminology-governance`: 定义项目术语表、术语作用域和 `buildr.terminology-governance/v1` 可替换专业能力及其结果证据。
- `current-knowledge-maintenance`: 定义当前认知文档结构、按影响创建/更新机制，以及 `buildr.current-knowledge-maintenance/v1` 的 assess、reconcile、inspect 契约。

### Modified Capabilities
- `agent-first-product-positioning`: 区分潜在工作信息、Workspace 范围、受治理工作资产、Task Context 与有限 Context Window。
- `buildr-development-openspec`: 将单一 current-state 文件扩展为按概览、产品架构、技术架构、核心流程、Service 和术语组织的当前认知，并规定 Change 驱动的维护时机。
- `agent-task-workflows`: 将当前认知评估、维护、收敛和检查通过 capability dependency 与 Component contribution 接入 propose、apply、sync 和 task-finish。
- `change-asset-indexing`: 在 active 与 archived Change 的只读详情中安全投影 Brief 的可用性、内容和来源。
- `local-workspace-application`: 将 Change 详情调整为生命周期摘要和 Brief 优先、技术 artifacts 可继续深入的阅读结构。

## Impact

- Product OpenSpec：新增三个 capability specs，修改当前认知、Agent 工作流、Change 索引、本机应用和产品上下文模型相关 specs。
- Workspace 资产：新增两个 capability contracts、两个默认 provider Skills，并更新 `skills/manifest.yml`、默认 bindings、OpenSpec Component contributions 与相关 runtime 投射。
- Buildr Service：扩展 Change read model、本机应用 Change 详情视图、package assets、完整性检查和相关测试。
- Product knowledge：建立 `openspec/knowledge/` 的当前认知结构，并以已有 specs、实现和 registries 为依据迁移真实事实；历史 Change 仅作为来源线索。
- 外部依赖：以 OpenSpec 1.6.0 的 artifact/status/action context 为基础；不修改外部 `openspec-*` Skill 源，也不扩展 OpenSpec 自有 artifact schema。
