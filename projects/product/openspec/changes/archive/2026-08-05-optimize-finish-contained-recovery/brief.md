# 优化 Finish 已包含恢复与自举同步时序

一句话摘要：减少 Task Finish 在 carrier 已交付后因自举同步或并行 target 前进产生的重复恢复，同时保持通用 Finish 与 Buildr 自举 Workspace 的职责隔离。

## 背景与问题

Task Finish 先推送 carrier、后运行 retained Doctor。Buildr 自举 Workspace 的 package 变更会让 Doctor 报告 Component 待更新，但 self-bootstrap 当前只允许在 Formal Finish 成功后运行；若 Agent提前同步并推送，会自行制造 target-race。真实并行交付继续推进target时，当前恢复还会把已存在于新target中的Task Contribution再次应用，产生假冲突和无功能适配提交。

## 目标与非目标

- 目标：自举同步先在本地形成受控commit，Formal Finish成功后再发布；通用Finish确定性识别最新target已完整包含carrier。
- 非目标：不让通用executor感知self-bootstrap，不增加插件/状态库，不放宽其他Doctor问题或同路径变化。

## 核心流程

```text
carrier已push → Doctor仅提示自举Component待更新
→ self-bootstrap本地sync+commit（不push）
→ resume Finish → Formal Finish成功
→ publish本地commit → remote readback → Doctor

并行target前进
→ ancestor + changed-path mode/blob包含证明
→ already-contained → Doctor → cleanup
```

## 关键变化

- self-bootstrap Skill新增严格受限的prepare/publish语义。
- Task Finish deliver新增carrier完整包含证明与类型化结果。
- 无法证明时继续使用现有target-race/Delivery Adaptation。

## 影响与风险

- 影响Task Finish Git delivery、自举Workspace Skill及其验证。
- 风险集中在错误放行并行同路径变化；逐路径mode/blob校验保持fail closed。

## 验收摘要

- 自举prepare不提前push；成功Finish后才发布。
- 最新target完整包含carrier时不重复apply、不新增carrier commit。
- 同路径变化、非祖先和其他Doctor问题继续阻塞。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/agent-task-workflows/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
