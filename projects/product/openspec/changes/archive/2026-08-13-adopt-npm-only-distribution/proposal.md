## Why

Buildr 当前仍是面向开发者的完整 CLI 与本机 Buildr Web，目标用户已经具备 Node/npm，图形入口也只负责启动 `buildr web`。在这个产品阶段同时维护 SEA、PKG/MSI、平台签名、公证、安装事务和 GitHub Release 二进制资产，会引入明显高于用户价值的产品与运维成本，因此需要把正式分发收敛回 npm Registry，并把图形入口定义为 npm 安装的本机投射。

## What Changes

- **BREAKING**：`@buildr-ai/buildr` 成为 Buildr 唯一正式产品安装与分发渠道；当前不再构建、验证或发布 Product Node、SEA、`.pkg`、`.msi` 和 GitHub Release 平台资产。
- 保留统一 application payload、完整 CLI、Buildr Web runtime、Web dist、migrations、产品/协议 identity 和单一 npm tarball/integrity/readback 契约。
- npm Buildr 主进程只使用 `engines.node` 允许的已登记 Host Node；Workspace-owned 子进程继续使用 `.buildr/workspace.yml` 精确声明的 Workspace Node，二者 identity 与生命周期保持分离。
- npm 包提供显式 `buildr web launcher install|status|repair|uninstall`：macOS 生成本机 `Buildr Web.app` 薄 wrapper，Windows 生成 Start Menu 快捷方式；普通安装默认不修改 Applications 或 Start Menu。
- Launcher 保存并验证 npm 安装 identity、Host Node executable、Buildr package entry 与 npm prefix；点击后精确执行同一 npm Buildr 的 `web` 命令，不复制 Node、Buildr package、源码或 runtime，也不形成独立更新渠道。
- npm 更新后原子刷新 Launcher binding；Node、package、entry、prefix 或 installation identity 漂移时 fail closed，并通过 status/repair 给出恢复动作。
- 将 SEA 与平台 installer 的设计知识保留为未来恢复条件，但从当前实现、发布 workflow、验证 declaration、release checklist 与正式产品承诺中退出。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `buildr-application-payload`: 应用负载只由 npm tarball 消费；不再要求跨 npm/平台制品比较或 SEA 资源布局。
- `npm-cli-package`: npm package 成为唯一正式产品安装，并包含完整 CLI/Web 与本地图形 Launcher 管理能力。
- `local-workspace-application`: Buildr Web Launcher 改为显式安装的 npm 本机投射，定义 install/status/repair/uninstall、绑定漂移与无复制边界。
- `buildr-cli-self-update`: npm 更新只更新 npm package，并在成功后刷新已登记 Launcher binding；不再包含平台 installer update 路由。
- `workspace-node-toolchain`: 保留 Host Node 主进程与 Workspace Node 子进程的严格分离，移除 Product Node 当前正式角色。
- `agent-readable-doctor`: Doctor/status 展示 npm 安装、development、当前实例与 Launcher binding，不再把平台安装作为当前渠道。
- `open-source-release-governance`: 正式发布只包含 npm Registry 的唯一 tarball；GitHub Release 不承载当前平台二进制。
- `platform-release-artifacts`: 撤销当前 SEA/PKG/MSI 正式能力，保留未来恢复条件而不进入发布链路。
- `product-verification-quality`: 以最终 npm tarball和本机 Launcher lifecycle 为 Release 目标，移除平台 installer、签名、公证与矩阵门禁。
- `public-json-contracts`: 收敛 installation/Launcher JSON 到 npm、development 与当前实例，不再公开当前平台制品 manifest。

## Impact

- Product canonical specs、当前认知、产品/技术架构、发布流程、Service 说明、术语与发布检查表。
- `buildr` Service 的 Launcher 管理、installation identity/update authority、npm postinstall/update 接缝、Doctor/status、测试 registry 和 release scripts。
- `.github/workflows/publish.yml` 收敛为单一 npm tarball 的 pack、smoke、protected publish 与 Registry integrity readback；删除平台原生 jobs、GitHub Release Asset ensure 和平台签名输入。
- 删除尚未交付的 SEA、Node distribution、PKG/MSI、平台 manifest/checksums/readback 实现和对应依赖；不得恢复复制 Node/Buildr 的旧 Launcher。
- 本 Change 不创建 tag、不执行 `npm publish`、不修改真实 GitHub Release、不推送，也不执行 Task Finish。
