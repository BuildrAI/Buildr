## Why

当前发布流程在 Candidate、release→main 与无副作用 readiness 完成后就结束 `release-<version>` 协调 Task，publication、main→dev 与资源清理在 Task 外继续；rc.22 已因此产生多个 resume/refresh 协调 Task，并暴露中间 carrier、正式 release ref 与本地 selection cleanup 的所有权矛盾。现在需要把同一版本的发布身份、恢复和必需 closeout 收敛到一个可幂等恢复的产品流程，同时保持 publication 的独立人工授权与已发布事实不可回滚。

## What Changes

- 每个版本只允许一个 `release-<version>` 协调 Task；Task 从 selection 持续覆盖等待 publication 授权、protected transaction、main→dev 与必需 closeout，完成准备后保持 `active`，不再创建 resume/refresh/finalize 协调 Task。
- 由 release owner 提供阶段化、可重建的 lifecycle read model，并以 version、selection generation、context digest 与 publish run 维持同一恢复 identity；Task Record 仍只保存顶层状态，不承担发布状态机。
- 增加确定性的 release→main carrier 和 main→dev recovery identity、ownership evidence、远端竞争检查与幂等 closeout。
- 将正式远端 `release-<version>` 定义为默认保留并精确核验的正式 ref；本地 branch、selection lifecycle refs、临时 worktree 与本地/远端中间 carrier 属于必需清理资源。删除正式远端 release ref 继续是可选且独立授权的动作。
- 修正本地 selection cleanup：远端或 remote-tracking release ref 存在时仍可清理已证明属于该版本的本地资源。
- 明确 `dev` 收敛使用产品拥有的 merge commit并要求远端策略允许该非线性提交；不得依赖管理员绕过 `required_linear_history`。策略不满足时在 push 前失败关闭并返回同一 recovery identity。
- 增加覆盖 Candidate 失败、新 generation、同 SHA 暂态重跑、release-only 修复、squash carrier、publication 后语义冲突恢复、无代码协调 Task、保护策略漂移和零中间资源遗留的黄金生命周期测试。
- support 修复 Task 保持独立交付和证据关联，但不得成为第二个发布协调 Task。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-collection-model`: 修改 release Task 生命周期、正式/中间 ref 分类、carrier ownership、恢复 identity 与 closeout 要求。
- `open-source-release-governance`: 修改 publication 前后完成边界、授权等待、main→dev 分支策略与发布后恢复要求。
- `agent-task-workflows`: 修改 Buildr Release Skill 对唯一协调 Task、恢复、完成和 cleanup 的消费规则。

## Impact

- 受影响实现：`tools/release/release-selection.mjs`、`release-git-convergence.mjs`、`release-task-evidence-correlation.mjs`、`release-transaction-runner.mjs` 及相关 release helpers。
- 受影响工作方法与知识：`buildr-release` Skill、release checklist、open-source release flow 与 Buildr Service current knowledge。
- 受影响测试：release selection、Git convergence、Task correlation、transaction/readiness 与新增黄金生命周期集成测试。
- 不改变 npm/tag/GitHub Release 的独立授权边界，不执行真实 publication，不回写历史 rc.22 Task。
