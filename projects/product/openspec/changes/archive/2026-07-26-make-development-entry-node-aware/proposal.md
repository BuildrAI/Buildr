## Why

Buildr 自举开发入口当前由 `#!/usr/bin/env node` 直接启动，PATH 中较早出现 Node 18 时会在 CLI 逻辑运行前因 ESM 解析失败。Agent 虽然可以手动切换到配套 Node，但每次先失败再修正会制造稳定且无价值的重复动作。

## What Changes

- 让 `projects/product/buildr` 在启动 Service CLI 前选择满足 Buildr `engines.node` 要求的 Node runtime。
- 支持通过 `BUILDR_NODE` 显式指定 Node，并自动检查 PATH 中的 Node 与 Agent runtime 相邻的 bundled Node。
- 找不到兼容 Node 时返回包含最低版本和恢复动作的确定性诊断，而不是暴露 JavaScript 解析错误。
- 保持 Product bridge 为薄入口，Node 选择逻辑仍由 Buildr Service 单一实现根拥有。
- 不包含破坏性变更；已有兼容 Node 的调用行为保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `npm-cli-package`: 扩展 development checkout 的稳定 Project bridge 契约，使其能选择兼容 Node 或给出可操作诊断。

## Impact

- 影响 `projects/product/buildr`、Buildr Service 内的开发启动器、相关 contract/verification tests 和开发文档。
- 不改变 npm package 的 `buildr` bin、公开 CLI 命令、workspace 数据或 Agent runtime adapter 契约。
