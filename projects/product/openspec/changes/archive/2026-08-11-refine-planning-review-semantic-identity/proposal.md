## Why

当前正式 Task 的 OpenSpec Planning Review target identity 由 Agent 手工拼接 artifact 文件摘要。该做法会把 `tasks.md` checkbox 完成态、active/archive 路径和文件时间等执行事实误当成计划语义，同时又允许 Agent 在归档后人工沿用旧 identity，既造成重复审查，也缺少可验证的保守失效边界。

## What Changes

- 新增一个只读、无持久化的 Task Planning Identity Application，基于 Task Intent、scope 与关联 OpenSpec Change 的 proposal、design、delta specs 和任务文本生成确定性语义投影及 target identity。
- 明确排除 checkbox 完成态、active/archive 物理路径、文件时间、Brief 与 workflow sidecar 等非规范执行事实。
- 当 Task、Environment、Change、必需 artifact 或结构无法可靠解析时返回 blocked diagnostic 和空 target identity，禁止猜测或复用旧 Planning Review。
- OpenSpec propose/update/apply/converge 相关 Agent workflow 统一消费该结果；归档只改变 provenance，不改变语义 identity。
- Task Development 继续只保存最小 planning node 与 opaque target identity，不新增第二个 store、history 或 Review writer。
- 不包含破坏性变更；已有 Review Result 与 Development Receipt 保持可读，只有 consumer 使用新 resolver 后才按新 target 判断适用性。

## Capabilities

### New Capabilities

- `task-planning-identity`: 定义正式 Task 的 OpenSpec 计划语义投影、确定性 aggregate identity、非语义执行事实排除项和无法可靠解析时的保守失败结果。

### Modified Capabilities

- `agent-task-workflows`: OpenSpec sidebar 在 Planning Review 与 Development planning 前必须使用统一 resolver，不再手工拼接文件摘要。
- `task-development`: OpenSpec planning target 使用语义 identity；归档 provenance 与 checklist 进度不得单独使 Review stale。
- `buildr-package-assets`: 产品包与 runtime Skill projection 必须交付 resolver、内部 driver 和更新后的 consumer 指引。

## Impact

- 影响 `services/buildr/src/domain`、`services/buildr/src/application`、内部 driver 与 runtime composition。
- 影响 Buildr package 中的 `task-development`、`task-review`、`openspec-propose`、`openspec-update-change`、`openspec-apply-change` 和 OpenSpec contract guard 指引。
- 增加 Unit、Application/Integration 与 package contract 测试；不新增数据库表、公共 CLI、依赖或远端副作用。
