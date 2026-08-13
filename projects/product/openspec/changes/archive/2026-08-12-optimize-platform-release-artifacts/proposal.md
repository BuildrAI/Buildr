## Why

Buildr 当前同时具备 npm tarball、携带运行时的 Buildr Web Launcher 与 tag 发布 workflow，但平台 Launcher 仍以运行时目录和宿主命令拼装为中心，缺少一份跨渠道可比较的应用负载、真正自包含的单可执行产品单元、平台 installer、正式 Release Asset 与逐字节恢复契约。上一任务已经把用户界面正式迁移为 Buildr Web，现在需要收敛发布模型，避免产品 Node、npm 宿主 Node 与 Workspace Node 继续混用，也避免把 GitHub Actions 临时 artifact 当成公共分发物。

## What Changes

- 建立一份包含 CLI、Core/Application、SQLite migrations、Buildr Web Runtime、正式 Web dist、运行依赖和产品/协议 identity 的 Buildr 应用负载；npm 与平台构建消费同一负载并发布可比较摘要。
- npm 继续只发布 `@buildr-ai/buildr` tarball：不携带 Node 或平台 Launcher，使用满足 `engines.node` 的宿主 Node，同时保留完整 CLI 与 `buildr web`。
- macOS 与 Windows 平台渠道优先使用 Node.js 单可执行应用（Single Executable Application, SEA），由同一 `buildr`/`buildr.exe` 同时承担 CLI 与 `web` 命令；installer 只增加薄图形入口、PATH/shortcut 与安装元数据，不复制第二份 Node 或 Buildr。
- 平台安装只有显式执行 `buildr web` 时才启动 HTTP；Buildr Web Launcher 继续打开浏览器，不引入 WebView、Electron、Tauri 或原生桌面客户端，`Buildr App` 仍保留给未来真正桌面产品。
- **BREAKING**：平台安装的 Buildr 主进程固定使用其产品 Node/SEA，不再因进入 Workspace 而切换为 Workspace Node；Workspace Node 只运行 Workspace-owned npm、验证、Finish adapter 与项目子进程，并保持独立 identity、升级和卸载生命周期。
- 将 macOS `.pkg`、Windows `.msi`、release manifest、checksums 与必要签名材料定义为对应不可变 Git tag 的 GitHub Release Assets；npm tarball 仍只由 npm Registry 承载，GitHub Actions artifact 只保留临时构建证据。
- 扩展 tag workflow：一次解析 release contract，一次构建每份制品，先完成全部可逆构建/验证，再进入受保护发布；生产签名条件缺失时 fail closed；GitHub Release/Assets 使用缺失补齐、相同复用、漂移停止的 ensure 语义，并从公共地址重新下载最终 bytes 验证。
- 让 `buildr update`、Doctor/status 与 Launcher 管理读取受签名或本机持久化的安装 identity，分别识别 npm、正式平台、development 与当前实例，不根据 PATH 或文件名猜来源，也不跨渠道覆盖。
- 增加真实 npm tarball、SEA、installer、安装/升级/回滚/重复安装/卸载、无系统 Node/PATH、签名门禁、manifest/checksums、Release Asset ensure/readback 与体积/inventory 验证；未经验证的平台/架构不进入公开矩阵。

## Capabilities

### New Capabilities

- `buildr-application-payload`: 定义单一 Buildr 应用负载的内容边界、构建一次语义、跨渠道 identity、资源 materialization 与许可证要求。
- `platform-release-artifacts`: 定义 SEA、macOS `.pkg`、Windows `.msi`、Launcher/CLI 单 executable、制品矩阵、manifest/checksums、签名门禁、GitHub Release Assets 与 ensure/readback 契约。

### Modified Capabilities

- `npm-cli-package`: 收敛 npm 渠道为不含 Node/平台 Launcher、依赖宿主 Node 但完整支持 `buildr web` 的同一应用负载消费者。
- `workspace-node-toolchain`: 将 Workspace Node 明确限制为 Workspace-owned 子进程，并与平台产品 Node、npm 宿主 Node 的 identity 和生命周期完全分离。
- `buildr-cli-self-update`: 让 update 按可信安装来源只更新 npm、平台或 development 自身，禁止跨渠道覆盖。
- `local-workspace-application`: 将正式 Buildr Web Launcher 收敛为平台产品单元中的薄入口，并保持按需 HTTP、数据保留和 development channel 隔离。
- `open-source-release-governance`: 将正式平台制品定位到 GitHub Release Assets，增加签名、公证、asset ensure、公开 readback 与不可逆动作前门禁。
- `product-verification-quality`: 以最终 npm tarball、SEA 和 installer 为验证目标，覆盖无系统 Node、安装生命周期、渠道隔离、体积和逐字节 manifest/checksums。
- `agent-readable-doctor`: 分别展示 npm CLI、正式平台安装、development launcher 与当前运行实例的版本、路径、runtime 来源和 identity。
- `public-json-contracts`: 为应用负载、安装来源、平台制品 manifest 与多渠道状态增加稳定、可核对且不泄露敏感材料的公共 JSON identity。

## Impact

- Product OpenSpec、当前认知、术语表、产品/技术架构、Service 说明与发布清单。
- `buildr` Service 的 package metadata、运行时 bundle/asset 构建、Node SEA 注入、macOS/Windows installer、Launcher/CLI identity、更新来源识别、Doctor/status、发布脚本和测试。
- `.github/workflows/publish.yml` 及平台原生 GitHub Actions jobs、签名/公证/安装验证和 GitHub Release Asset ensure/readback。
- 新增构建工具或依赖必须进入 lockfile、许可证 inventory 与开源候选边界；不得把 `buildr-web` 源码、Vite toolchain、Node headers/npm/npx 或开发依赖带入正式平台运行负载。
- 本 Change 不创建 release tag、不执行 `npm publish`、不创建/修改真实 GitHub Release、不上传正式资产、不配置真实签名密钥，也不推送发布分支。
