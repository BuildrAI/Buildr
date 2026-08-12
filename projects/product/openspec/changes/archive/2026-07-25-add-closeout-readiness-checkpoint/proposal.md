## Why

OpenSpec 与 Component 等资产版本升级可能同时改变外部 CLI、Service-local 依赖和生成资产。当前 `task-finish` 虽覆盖验证、同步与归档，但这些收敛项会在 Candidate、归档或运行时同步之后才暴露，造成可避免的重复验证与修复循环。

## What Changes

- 为 `task-finish` 增加 Candidate 前的 closeout readiness checkpoint：仅在变更触及受管资产或 OpenSpec 升级信号时，先核对外部 CLI、Service-local 依赖、生成完整性和格式。
- 明确外部工具不由“收尾”隐式安装或升级；版本不匹配时停止并给出可执行修复路径。checkout-local 依赖仅在当前 Project 已声明 lockfile 且属于任务环境准备时按既有 `npm ci` 路径收敛。
- 在 OpenSpec archive 后确认没有遗留的空 active-change scaffold；只清理已证明为空且由本次 archive 遗留的目录，并再次执行 strict validation。
- 为该行为添加 Package contract 断言，保证不扩大既有 verification、Git integration 或 worktree lifecycle capability contract。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: Task Finish 在 Candidate 与 archive 边界增加受范围约束的 readiness checkpoint 和残留检查。

## Impact

- `skills/buildr/task-finish/SKILL.md` 及随包副本。
- Buildr Package 的 Task Finish contract tests。
- 不新增命令、不修改外部 `openspec-*` Skills、不改变现有 capability bindings。
