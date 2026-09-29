## Why

共享分派器 `src/bootstrap/cli/registry.ts` 用固定下标解构 `rawArgs`，第三个位置参数无条件成为路由上下文（Route Context）的 `runtimeId`。`buildr skills render --target <dir>` 这类省略运行时身份的调用因此把 `--target` 读成身份、把 `<dir>` 留成裸参数，最终报 `Unknown argument`。`cli-reference.md` 已将这些命令的 `<agent>` 记为可选，退役厂商适配器变更也确立了"省略身份走同一选择规则"的语义并显式把该缺陷列为独立变更的遗留项。

## What Changes

- 分派上下文契约修正：第三个位置参数只在不以 `--` 开头时才被消费为身份或命令词；否则 `runtimeId` 为 `null`，参数尾原样保留全部选项。
- `sync` 路由不再从 `context.action` 取身份，与 `parseRuntimeCommandArgs` 同一规则解析自身尾部。
- `rules render` 的能力门禁与 `runtime check` 的适配器选择改用含现场证据检测的同一选择规则；省略身份或只传 `--adapter` 时按规则解析，不再落到默认适配器。
- 相关命令 usage 与 `cli-reference.md` 对齐为 `[<agent>]`。
- 既有钉住缺陷的测试改为断言修复后契约。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workspace-first-runtime-projection`: runtime 命令的位置身份可选性、省略身份时的分派参数完整性与同一选择规则适用。

## Impact

- 代码：`src/bootstrap/cli/registry.ts`、`src/modules/agent-assets/interfaces/cli/agent-assets.ts`、`src/modules/agent-assets/module.ts`（CLI facade 增加 workspace 感知选择入口）。
- 测试：`test/integration/runtime-command-selection.test.ts` 中钉住缺陷的断言改为修复后契约，并补充省略身份的真实行为覆盖。
- 文档/帮助：相关命令 usage 中的 `<agent>` 改为 `[<agent>]`；`cli-reference.md` 当前表述已一致，无需语义改动。
- 兼容：显式 `<agent>` 与显式 `--adapter` 的行为不变；此前报错或落到错误适配器的省略身份形式改为按已声明语义工作。无破坏性变更。
