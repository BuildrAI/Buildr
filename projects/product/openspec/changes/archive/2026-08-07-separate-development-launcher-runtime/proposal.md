## Why

当前 `Buildr Dev.app` 把 Node.js runtime、动态库和 Buildr checkout 快照复制进 launcher；Node runtime 约占开发 App 体积的 96%，源码修改后还必须重新打包 launcher。Development channel 已绑定 checkout，适合改为直接使用当前 checkout 与受管 Node runtime，同时保留 Release launcher 的自包含体验。

## What Changes

- Development launcher 改为 checkout-backed，保存并校验 Buildr Service checkout，启动该 checkout 的 development CLI。
- Development launcher 不再把 Node executable、平台动态库、Buildr source 或依赖打进 `Buildr Dev.app`。
- Release launcher 保持 self-contained，继续携带 Node 和 Buildr application。
- 保留 channel 隔离、单实例、staging/verify/switch、回滚、identity 和运行中替换安全边界。
- 增加双平台 development launcher contract、checkout/Node 诊断和源码修改后无需重新打包的验证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-workspace-application`: 修改 development launcher 的运行时来源和 checkout 绑定；Release 继续自包含。
- `npm-cli-package`: 修改 development launcher 的 bundle 内容、Node 解析、identity 和安装诊断。
- `workspace-node-toolchain`: 明确 development launcher 引用 Workspace-managed Node，而不是复制 runtime。

## Impact

- 主要代码：`services/buildr/package/launchers/build.mjs`、`manage.mjs` 及 launcher tests。
- Development App 从源码快照改为绑定当前 checkout；Release App 行为保持不变。
- Development launcher 依赖可验证的 checkout 路径和 Workspace-managed Node；缺失时 fail closed，不自动安装。
- 需要更新 launcher、package/runtime contract 和当前架构文档。
