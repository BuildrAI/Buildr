# Development Launcher 改为 checkout-backed

## 一句话摘要

Release launcher 继续交付自包含运行时；Development launcher 改为绑定当前 Buildr checkout，并调用该 checkout 的 CLI 与 Workspace 管理的 Node，不再把 Node 和 Buildr 源码复制进 Buildr Dev.app。

## 背景与问题

当前 Development launcher 与 Release launcher 共用自包含打包路径，Buildr Dev.app 约九成体积来自内置 Node，且源代码快照会在开发修改后滞后。开发者需要重新打包才能看到 checkout 的实现变化，也容易把 launcher 快照与当前 Product checkout 混淆。

## 目标与非目标

目标是按 channel 分离 launcher 产物：Release 保持可脱离 Node、PATH 和 checkout 运行；Development 产出轻量 launcher，记录可验证的 source root 与 Workspace-managed Node identity，启动时使用当前 checkout，并在 source root 或 Node 不可用时 fail closed。既有单实例、身份、端口、替换、回滚和 macOS/Windows 诊断边界保持不变。

非目标是改变 Release 产物、把 worktree 自动跟随引入 launcher、下载或安装 Node、改用 PATH 猜测 runtime，或让 launcher 成为第二套 Buildr CLI/runtime writer。

## 受影响用户或角色

- 使用 Buildr Dev.app 运行本地开发 Local App 的 Buildr 开发者。
- 使用 Release launcher 的终端用户与发布流程。
- 维护 Buildr CLI、Workspace Node toolchain、launcher 安装与 Doctor 的开发者。

## 核心流程

Development 安装先解析当前 checkout 和 Workspace Node identity，生成不含 Node、dylib、Buildr source、package 或 node_modules 的 launcher。启动时验证 source root、CLI entry 和 Node executable/version，调用 checkout 的 `bin/buildr.mjs app --port 4317`；Release 继续调用 bundle 内的 Node 与应用资源。source 变化在重启 Local App 后生效；路径或 runtime 失效时保留现有安装，返回安装/同步修复指引。

## 关键变化

- launcher builder 按 channel 分流，Development 不复制运行时和应用快照。
- launcher identity 增加 source root、checkout identity 和 Workspace Node runtime identity。
- macOS shell 与 Windows cmd 都使用记录的绝对 checkout/runtime 路径，禁止 PATH fallback。
- status/install/rollback 对 source、CLI 和 Node 缺失提供明确诊断。
- Release 的自包含资源、用户无需 Node/PATH 的契约和既有生命周期保持不变。

## 影响、风险与兼容性

Development 安装体积显著下降，但它依赖当前 checkout 与已准备的 Workspace Node；移动 checkout、删除 managed runtime 或使用不匹配的 launcher identity 会导致启动失败，需要重新安装/同步。Release 无行为变化。安装仍先 staging、校验、停止同 channel 实例，再原子替换并保留 rollback；失败不破坏现有 launcher。

## 验收摘要

- Development macOS/Windows bundle 不包含 Node、dylib、Buildr source 或 node_modules，并记录 source/runtime identity。
- Development launcher 使用当前 checkout，路径含空格可用；源文件更新后重启即可观察到新实现。
- 缺失 source root、CLI 或 managed Node 时 fail closed，日志包含恢复动作。
- Release 仍包含 Node、Buildr web resources、yaml、平台资源，并可脱离 PATH/checkout 启动。
- builder、identity、生命周期、安装替换、JSON status、Doctor/size 回归均通过。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Local App delta spec](specs/local-workspace-application/spec.md)
- [CLI/package delta spec](specs/npm-cli-package/spec.md)
- [Workspace Node delta spec](specs/workspace-node-toolchain/spec.md)
- [Implementation tasks](tasks.md)
