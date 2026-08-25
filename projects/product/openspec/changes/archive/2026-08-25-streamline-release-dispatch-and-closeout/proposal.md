## Why

当前发布流程已经具备唯一 `release-<version>` Task、冻结 Release Context、受保护 Publication、dev provenance reconciliation 与幂等资源 closeout，但 Agent 仍需在 PR merge 后和 Publication 后分别拼装多个 owner 的输入、结果与生命周期事实。rc.23 显示本地 readiness/dispatch 等待和手工 closeout 的耗时、identity 传递风险及阶段统计成本已经值得用窄编排能力收敛。

## What Changes

- 增加 release lifecycle orchestration runner，在 PR merge 后一次构造 current frozen context并返回唯一 publication approval 请求；维护者授权后重验同一 context digest并调用既有 protected dispatch owner。
- 增加 Publication 后幂等 closeout 编排，按既有 owner 顺序消费 hosted evidence、执行只读 dev provenance reconciliation、release resource closeout、协调 Task no-change completion、Task Environment cleanup与最终 Doctor。
- 全程保留 Publication 授权、Task Record、Task Environment、release Git/readiness/transaction 与 Doctor 的独立 authority；编排器不建立综合持久化状态、不补造成功事实，也不扩大远端删除授权。
- 生成可移植 Release Phase Timeline，记录 selection/freeze、Candidate attempts、PR merge、readiness、等待授权、dispatch/approval、Publication、reconciliation和closeout的阶段边界、owner identity及等待类型；支持表达多次 Candidate attempt、成功 shard evidence 复用、新 attempt与最终 aggregate。
- 本 Change 可以先完成实现和 focused/affected 开发反馈；完整端到端验收等待 `stabilize-remote-skill-timeout-test` 与 `support-candidate-failed-shard-retry` 交付后执行。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: `buildr-release` 改为消费统一的 readiness/dispatch 与 post-publication closeout 编排结果，同时保留显式 publication 授权与各 owner 失败恢复边界。
- `open-source-release-governance`: 增加可幂等恢复的 release orchestration、可移植 Release Phase Timeline、阶段/等待分类和跨 Candidate attempt evidence 表达要求。
- `release-collection-model`: release lifecycle projection 增加由 current owner facts 派生的阶段时间线与编排恢复输入，不增加 Task Record 字段或旁路 workflow store。

## Impact

- 影响 `projects/product/services/buildr/tools/release/` 中 release lifecycle、transaction、hosted evidence、Git convergence与新 orchestration runner。
- 影响 `buildr-release` Skill、release checklist、Buildr Service current knowledge和相应公开 JSON schema/compact summary。
- 增加 unit、integration-candidate-release 与真实 runner fixture 覆盖；不改变 npm publication authority、GitHub Environment审批或正式远端 release ref 默认保留策略。
