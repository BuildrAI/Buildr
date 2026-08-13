# 优化 Buildr 发布制品与双渠道分发

## 一句话摘要

以一份可摘要比较的 Buildr Application Payload 同时生成完整 npm package 与自包含平台安装包，并把 Product Node、npm Host Node 和 Workspace Node 的身份、更新及卸载生命周期彻底分离。

## 背景与问题

当前正式发布只冻结 npm tarball，所谓 release Launcher 则复制构建机 Node、Buildr 源码和依赖目录。它既不是 Node Single Executable Application（SEA），也不是可签名、公证和安装验证的 `.pkg` / `.msi`；npm tarball 还会带入平台 Launcher 工具。发布 workflow 先执行不可逆 npm publish，GitHub Release 只维护元数据，平台二进制仍停留在临时 Actions artifact。CLI 更新和 Doctor 又通过路径形态推断来源，并把当前进程 Node 与 Workspace Node 视为同一生命周期。

## 目标与非目标

目标是只构建一次平台无关应用负载，让 npm 与平台载体消费相同 payload identity；npm 使用 `engines.node` 允许的 Host Node，平台安装使用精确、官方、摘要验证的 Product Node SEA；macOS `.pkg` 与 Windows per-user `.msi` 中 CLI 和 Buildr Web Launcher 指向同一 executable；GitHub Release Assets 承载不可变平台制品、manifest 和 checksums；发布 workflow 在所有可逆验证通过后才进入 npm / Release 写入，并支持缺失、相同、漂移和部分成功重跑。非目标是创建 tag、执行 npm publish、创建或修改真实 Release、上传正式资产、配置真实签名凭证、推送发布分支，或实现 WebView/Electron/Tauri/原生 Buildr App。

## 受影响角色

- 普通 macOS / Windows 用户：通过一个自包含产品单元获得 CLI 与 Buildr Web，不安装系统 Node，也不会在普通 CLI 命令下启动 HTTP。
- npm 用户：继续安装 `@buildr-ai/buildr`，使用兼容 Host Node，并获得完整 CLI 与 `buildr web`，但不取得平台 Launcher 或 Product Node。
- Workspace 维护者：Workspace Node 仍由 `.buildr/workspace.yml` 精确声明，只供 Workspace-owned npm、验证、Finish adapter 与项目执行，不随 Buildr 产品升级或卸载变化。
- Buildr 发布维护者：从唯一 release contract 构建、冻结、签名、验证和恢复同一 bytes，并能解释每个制品的来源、identity、摘要和体积。

## 核心流程

release contract 固定 Buildr version、Product Node version、协议、commit/tag 与正式平台矩阵。一次 payload build 生成主 CJS bundle、Worker bundle、版本化资源目录和摘要清单；npm pack 从该负载只生成一次 tarball，平台原生 job 将同一主 bundle 注入精确官方 Node executable，安装同一资源目录，并在注入后完成平台签名。所有 installer candidate、manifest 与 checksums 在公开写入前冻结并验证；真正发布时 npm tarball只进入 npm Registry，平台安装包只进入对应 GitHub Release Assets，随后从公共地址重新下载最终安装制品完成 readback。

## 关键变化

- 新建单一 application payload contract，并让 npm / SEA 消费同一 payload digest；不携带源码、Vite、headers、npm/npx、测试、fixtures 或开发依赖。
- SEA 主进程使用 Product Node，npm 主进程使用 Host Node；两者进入 Workspace 后均不切换为 Workspace Node。Workspace-owned subprocess 只显式解析声明的 Workspace Node。
- macOS 安装一个含唯一 Buildr SEA 的 Buildr Web.app，CLI symlink 指向同一 executable；Windows 使用 per-user MSI，PATH 与 Start Menu shortcut 指向同一 `buildr.exe`，图形入口参数为 `web`。
- product identity receipt 明确 carrier 与 runtime role；update/status/Doctor 读取可验证 identity，不从 PATH、文件名或目录形态猜来源。
- workflow 形成 contract → payload/npm tarball → native SEA/installer/signing/install verification → manifest/checksums → protected publish → public readback 的门禁图；生产签名条件缺失即 fail closed。
- Development Launcher 保持 checkout-backed 的独立开发 channel；未来真正桌面应用仍保留 Buildr App 名称。

## 影响、风险与兼容性

Node 24 SEA 仍处于 active development，且只接受单一 CommonJS 主脚本，因此 Product Node 必须固定精确 patch、关闭 snapshot/code cache，并在每个正式平台原生验证。现有 ESM、动态 import、Worker、真实文件资源与 `process.execPath` 自调用需要共同适配；任一最终 installer/no-host-Node smoke 失败都阻塞该平台发布，不能静默退回复制完整 Node 开发目录。签名和时间戳会改变 bytes，因此公开写入后的重跑必须复用已冻结 signed candidate，不能重签并覆盖同名资产。Windows arm64 在存在原生安装与签名证据前不属于正式矩阵。

## 验收摘要

- npm tarball 没有 Node executable 或图形 Launcher，但包含完整 CLI、`buildr web`、Web dist、migrations、package baseline 与许可证，并在兼容 Host Node 上通过 CLI/Web health smoke。
- 最终平台安装制品在无系统 Node、污染 PATH 的环境中通过 CLI、代表性命令、Web readiness 和普通命令不启动 HTTP；CLI 与图形入口解析到唯一 SEA 并报告相同 Buildr、Node、protocol 与 payload identity。
- 安装、首次启动、升级、失败回滚、重复安装和卸载可验证；卸载保留 Workspace Registry、SQLite、日志和 Workspace 数据，正式与 development channel 相互隔离。
- release manifest / checksums 与实际 bytes 一致，资产 ensure 覆盖 missing/same/drift/partial rerun，正式签名/公证/安装/readback 门禁失败关闭。
- 记录实际 matrix、压缩与安装大小、Node / payload identity、验证范围、耗时及仍需真实凭证或外部平台验证的条件。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/buildr-application-payload/spec.md`
- `specs/platform-release-artifacts/spec.md`
- 其他 modified capability delta specs
- `tasks.md`

