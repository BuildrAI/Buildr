## Why

当前 self-bootstrap runner 把 Git trailer 当成 successor 身份的唯一证明，导致已经进入 `origin/dev`、线性包含 Finish 基准且能够由实际 activation 与 Doctor 检查的协作者提交，仅因提交方式不同而阻断自举收尾。这违反 Buildr “宽而薄”的基本方向：应严格保护真实 authority、目标和副作用边界，但不应把辅助 provenance 或特定工作方式升级成不必要的硬门禁。

## What Changes

- 将“宽而薄”提升为 Buildr Core 与 Product scope 的正式治理原则：只有继续推进会造成越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报时才关闭式失败；其他可恢复不确定性应如实诊断并保留 Agent 的安全推进空间。
- self-bootstrap runner 对 Finish `baseRef` 之后的 successor 改用真实 Git/remote 事实：要求 `baseRef` 是当前目标的祖先、后继链无 merge、本地 clean 且 HEAD 与精确 remote/branch 一致，不再要求每个 commit 携带 `Buildr-Task` 或 closeout trailer。
- 当前 run 自己生成的 successor 仍使用 `Buildr-Finish-Run` 与 `Buildr-Closeout-Plan` 精确识别，以维持未 push/已 push 的幂等恢复；这些 trailer 不再用于证明其他 descendant 的提交者或生命周期身份。
- 保持 target lease、foreign carrier、same-run resume、dirty、未 push descendant、remote drift、Development entry、Node 24.15.0 与最终 Doctor 语义不变，并更新 Skill、current knowledge、contracts 与回归测试。
- 不建立 External Adoption store、第二套 lifecycle authority 或本地重建协作者 Task 的路径；不补空提交、不伪造 trailer、不自动信任任意 HEAD。
- 本变更不包含发布行为，也不执行 rc.19 发布。

本变更不包含破坏性 API 或持久数据变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：明确 Buildr 工作流新增硬门禁时必须证明其保护的 authority/结果不变量与具体伤害；辅助证明或可恢复不确定性应形成诊断和 Agent 指引。
- `task-closeout-orchestration`：self-bootstrap activation base 从 trailer provenance 门禁改为已发布、线性包含 Finish ref 的精确 Git/remote 事实，同时保留 current-run successor 身份与既有安全边界。

## Impact

- Buildr Core Rule 产品源与 Product Project Rule。
- `buildr-self-bootstrap-sync` Skill、bundled runner、Component integrity 与相关 contract tests。
- `task-closeout-orchestration`、`agent-task-workflows` canonical specs 和 OpenSpec Change 生命周期 current knowledge。
- self-bootstrap closeout integration regression；不改变稳定 Finish projector schema、Task/Verification/Review store 或普通 Workspace 行为。
