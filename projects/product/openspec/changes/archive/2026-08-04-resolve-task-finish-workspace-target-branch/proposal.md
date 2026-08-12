## Why

真实 Task Finish 自举在 mutation 前暴露了一个 workspace source 缺陷：Task Environment 的 Git provider 以 `startPoint: HEAD` 记录 checkout 起点，Task Finish Application 却把该表达式直接冻结为交付目标分支。retained Workspace 实际位于 `dev`，因此 preflight 正确停止，但默认调用无法形成可执行交付目标。

## What Changes

- Task Finish 在创建 Git-backed run 时，从 retained checkout 当前符号分支解析默认 target branch。
- 显式 `--target-branch` 必须与 retained checkout 当前分支一致；detached 或不一致时在 run 创建前 fail closed。
- Task Environment `startPoint` 继续作为 checkout 来源证据，不再充当交付分支 authority。
- 增加 `startPoint: HEAD` 的 Application/System 回归覆盖，并同步最小 contract、Skill、CLI 和 current knowledge 事实。

## Capabilities

### Modified Capabilities

- `task-finish-execution`: 明确 Git-backed run 的 target branch 必须来自 retained 当前分支或与其一致的显式输入，不能从 Environment checkout 表达式推断。

## Impact

- 受影响代码：`services/buildr/src/application/task-finish/`。
- 受影响测试：Task Finish remote Integration 与完整 Product journey。
- 受影响资产：Task Finish canonical spec、capability contract、bundled Skill、CLI 文档与 Buildr Service current knowledge。
- 不改变 Task Environment Receipt、Development Candidate、Finish run/result schema、五阶段、Git push/readback 或恢复协议。
