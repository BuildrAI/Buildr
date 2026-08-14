# Retained Finish 受控自修复

## 一句话摘要

让 retained Task Finish 在自身 phase provider 阻断修复 Task 时，仍由原 Application 和 SQLite authority 复用同一 run，受控加载冻结候选 provider 并完成交付。

## 背景与问题

Task Finish 已把 retained canonical Application 与延迟加载的 Product phase provider 分开。若 retained provider 自身在 `preflight` 或 `prepare` 发生确定性执行缺陷，修复代码虽已进入 Task Environment，却仍会被旧 provider 阻断，形成无法交付自身修复的死锁。candidate CLI 写 canonical Workspace、临时 npm tarball 或人工 Git 旁路都会破坏既有 writer 与交付 provenance。

## 目标

- 只恢复已有、无交付副作用且明确属于 Product phase-provider 执行边界的 run。
- retained Application、repository、Execution Record、五阶段状态机和 Environment cleanup 始终保持唯一 owner。
- capsule 必须来自 current Environment 与冻结 Development/Candidate/Content Target 一致的 clean committed checkout，并在每次导入前验证完整 Git identity 与 cleanliness。
- failed/blocked 都复用同一 run；cleanup 和 terminal finalize 中断后可确定性恢复。

## 非目标

- 不恢复 CLI entry、registry、Application、repository、migration 或 Structured Store 损坏。
- 不替代 Delivery Adaptation、target-race、retained Doctor self-bootstrap 或 Task Environment cleanup。
- 不提供任意模块、manifest、tarball、candidate CLI、shell 或临时 npm runtime 入口。

## 核心流程

1. retained Application 读取已有 run，并只读确认 provider failure、无副作用、current Development carrier 与 ready Environment。
2. Execution Record open gate 成功后，Application 创建或精确复用 run-owned capsule并绑定 provenance。
3. retained state machine 调用 capsule 中的 provider 模块及其受验证依赖闭包；canonical mutation 仍经 retained runtime 完成。
4. 后续 blocked phase 使用同一 Product token 与 capsule；所有已通过 phase 不重放。
5. cleanup phase 持久化通过后，retained finalizer 撤销 capsule authority并提交 terminal SQLite state；任一中断都从同一 run 的当前事实恢复。

## 影响、风险与兼容性

- 主要风险是把“冻结候选代码”误写成“只执行一个导出函数”。ES module 会执行本地依赖闭包，因此安全边界必须是 current Candidate、完整 capsule tree、cleanliness、显式授权和最小 retained runtime façade。
- Result 只追加 bootstrap 字段，旧 run 缺少字段时保持兼容；不需要 schema migration。
- Task Finish Skill 必须把该模式描述为异常恢复，不得自动 fallback。

## 验收摘要

- 普通 Finish 路径行为不变，且 recovery resource 只能在 Execution Record gate 后创建。
- 非 provider failure、side effect 已存在、Environment/Development 漂移、capsule tree/dependency 漂移或 caller 选择代码时零 provider import fail closed。
- failed/blocked、撤销前后崩溃、terminal finalize 失败均复用同一 run、Candidate/generation 与正确 token。
- retained writer provenance、Environment cleanup owner、Formal Verification count 和现有 self-bootstrap runner 边界保持不变。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/cli-product-surface/spec.md`
- `specs/product-agent-skills/spec.md`
- `tasks.md`
