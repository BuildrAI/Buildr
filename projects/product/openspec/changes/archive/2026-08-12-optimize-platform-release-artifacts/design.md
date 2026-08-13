## Context

Buildr 当前的 npm tarball 已能提供完整 CLI 与 Buildr Web，现有平台 Launcher 则复制宿主 `process.execPath`、应用目录和启动脚本。二者没有共同的应用负载 identity，平台目录还把一整套 Node 运行时当作可复制目录处理；tag workflow 只发布 npm，并把 GitHub Actions artifact 当作主要制品证据。进入 Workspace 后切换主进程到 Workspace Node 的旧行为，也使产品运行时、npm 宿主运行时和项目工具链难以分别更新、诊断和卸载。

本设计把发布拆为一个平台无关的 Buildr 应用负载与两个分发适配器。应用代码、Buildr Web 正式静态资源、SQLite migrations、package baseline、必需依赖、许可证和产品/协议 identity 只形成一次；npm package 使用宿主 Node 执行该负载，平台安装包把同一 JavaScript 负载注入精确版本的官方 Node SEA，并携带同一份摘要校验资源。Buildr Web Launcher 仍只是执行 `buildr web` 的薄图形入口，不引入桌面客户端。

首个正式矩阵为 `darwin-arm64`、`darwin-x64` 和 `windows-x64`。三者都必须在原生 runner 上通过最终 installer 验证才有资格公开；本机不能提供的 Windows、生产签名、公证和公开 readback 只由 workflow 的 fail-closed 门禁证明，不能由本地 staging 验证冒充。`windows-arm64` 只有在未来被正式声明且完成同等原生验证后才能加入 manifest 和 Release Assets。

需要对齐的长期术语包括：应用负载（Application Payload）、产品 Node（Product Node）、宿主 Node（Host Node）、Workspace Node、平台产品单元（Platform Product Unit）和发布制品集合（Release Artifact Set）。规范持有行为，术语表只持有名称、边界与避免混用说明。

## Goals / Non-Goals

**Goals:**

- 让 npm 与全部平台构建消费同一份平台无关应用负载，并以同一 SHA-256 digest 证明内容一致。
- 让 npm package 不携带 Node 或平台 Launcher，但继续完整支持 CLI 与 `buildr web`。
- 让平台安装使用 Node `24.15.0` SEA，CLI 与 Buildr Web Launcher 最终引用唯一的 `buildr`/`buildr.exe`。
- 分离产品 Node、npm 宿主 Node 和 Workspace Node 的 identity、进程用途、升级与卸载生命周期。
- 生成可签名、公证、安装和卸载的 macOS `.pkg` 与 Windows per-user `.msi`，并验证最终 installer 而非 staging 目录。
- 让 tag workflow 先冻结并验证全部 bytes，再按 ensure 语义发布到 npm Registry 与 GitHub Release Assets，并从公共地址逐字节回读。
- 为 manifest、checksums、安装来源、Doctor/status、体积与许可证提供稳定、可自动验证的证据。

**Non-Goals:**

- 不实现 WebView、Electron、Tauri、原生桌面客户端或名为 Buildr App 的产品。
- 不把 Workspace Node 打进平台产品，也不在本任务实现多个 Node identity 的物理磁盘去重。
- 不把 `buildr-web` 源码、Vite toolchain、Node headers、npm/npx、测试、fixtures、源码映射或开发依赖带入平台运行负载。
- 不在本任务创建 tag、执行 `npm publish`、创建或修改真实 GitHub Release、上传正式资产、配置真实签名密钥、推送发布分支或执行 Task Finish。
- 不把 GitHub Actions artifact 变成公开下载渠道；它只保存同一 run 的冻结候选与验证证据。

## Decisions

### 1. 应用负载是唯一的跨渠道内容 authority

发布准备先在一个受控 job 中生成平台无关的 `application-payload`。负载包含：可由 Node 执行或注入 SEA 的单一 CommonJS runtime bundle、Buildr Core/Application/CLI、Buildr Web HTTP runtime、提交到 `buildr/web-dist` 的正式前端产物、SQLite migrations、Workspace/package baseline、需要物化的 worker 或模板、生产依赖许可证以及 Buildr version、protocol identity 和来源 commit。

构建器对规范化 manifest 和每个文件的相对路径、mode、size 与 SHA-256 做有序摘要；时间戳、绝对路径和构建机器信息不进入 identity。`applicationPayloadDigest` 只描述公共应用负载，不包含 npm 渠道 envelope、Node executable、installer metadata 或平台签名，因此 npm 与所有平台 manifest 必须报告相同值。负载构建一次后作为冻结 CI evidence 传给 npm 与原生平台 job；下游不得从 checkout 重新 bundle 或重新复制 Web dist。

选择显式 payload directory 而不是把全部资源塞进 SEA，是因为 Buildr Web 静态文件、SQLite migration、worker 和 package baseline 需要真实文件语义。与源码目录直接相对解析相比，摘要校验的资源目录能保留清晰的版本、materialization 与清理边界，同时避免 SEA asset API 对动态资源访问施加隐式限制。

### 2. npm 与平台只增加渠道 envelope，不分叉业务实现

npm staging 将同一 runtime bundle、资源目录和 payload manifest 放入 `@buildr-ai/buildr` tarball，由薄 `bin/buildr.mjs` 在满足 `engines.node` 的宿主 Node 中执行。tarball inventory 明确排除 Node executable、`.app`、`.pkg`、`.msi`、Windows shortcut/VBS、平台 Launcher 源和 installer toolchain。`npm pack` 只执行一次；smoke、publish 和 registry integrity readback 使用这一 tarball 的同一 bytes。

平台 staging 将同一 runtime bundle 注入各目标的官方 Node `24.15.0` executable，并在 executable 相邻位置安装 digest-verified resource directory。渠道 envelope 只增加 Product Node identity、platform、architecture、安装 channel 与 installer identity。平台代码和 npm 代码仍调用同一 CLI/Application/Web 实现，不维护 CLI-only 或 Launcher-only 业务分支。

### 3. SEA 使用精确官方 Node，并在注入后签名

SEA builder 使用目标平台官方 Node `24.15.0` executable 和由同版本 Node 产生的 blob。注入配置关闭 snapshot 与 code cache，以保留 bundle 内受控动态加载；`node:*` builtin 保持 external，其中 SQLite 使用 Node 24 内置 `node:sqlite`，不引入第二个原生 SQLite addon。builder 必须校验 Node 发行包官方 checksum，保留 Node 与依赖许可证，只提取运行所需 executable/动态库，不复制官方开发发行目录。

构建顺序固定为：验证官方 Node bytes → 生成同版本 SEA blob → 清除基 executable 的可移除签名 → 注入 `NODE_SEA_BLOB` → 组装并摘要校验资源 → 执行未签名候选 smoke → 平台代码签名 → 组装/签名 installer → macOS 公证并 staple → 最终签名/Gatekeeper 或 Authenticode/MSI 验证 → 计算最终 artifact SHA-256。签名或公证之前计算的 digest 不能冒充最终 artifact digest。

如果 bundle、内置 SQLite、动态加载、资源访问或平台签名证明 SEA 无法满足正式路径，构建必须停止并保存最小复现证据。不得静默退回复制完整 Node 发行目录；任何替代分发架构都需要新的设计决定。

### 4. `process.execPath` 不再代表“可随意执行脚本的 Node”

SEA 中的 `process.execPath` 是 `buildr` 产品 executable，不能再用 `process.execPath -e ...` 或 `process.execPath <script>` 假装调用通用 Node。实现引入显式 runtime execution abstraction：

- 产品自身重新进入 CLI/Application 时，通过同一 `buildr` executable 的受控 internal command 或进程内 API；
- product-owned worker 优先使用同进程 `worker_threads`，确需真实文件时从已校验 payload resources 解析；
- Workspace-owned npm、验证、Finish adapter 和项目脚本，只能通过 Workspace Node resolver 取得 `.buildr/workspace.yml` 声明的精确 executable；
- npm 主进程继续由调用 tarball CLI 的兼容宿主 Node 承载；平台主进程固定为 embedded Product Node，不因 cwd 或目标 Workspace 改变。
- development CLI/Launcher 主进程使用其 identity 明确绑定的 compatible development host Node；它可以与 Workspace Node 版本相同，但不得把 Workspace-owned runtime receipt 当作 development runtime ownership，只有随后启动的 Workspace-owned subprocess 才解析 Workspace Node。

选择显式分类而不是检测 `process.execPath` 文件名，是为了让同一业务代码在 host Node 与 SEA 中保持相同行为，并防止平台进程偷偷落回 PATH Node。测试必须枚举和禁止未经分类的 `process.execPath` script/`-e` 调用。

### 5. 平台安装是一个产品单元，图形入口由同一 executable 解释

macOS `.pkg` 安装 `/Applications/Buildr Web.app`。Bundle 内只有一份实际 SEA `Contents/MacOS/buildr`，`CFBundleExecutable` 直接指向它；该 executable 在从 Bundle 无参数启动时把入口解释为 `web`，CLI shim/symlink 则直接指向同一 SEA。不存在第二个 wrapper、Node 或 Buildr executable。资源、identity、许可证与正式 `Buildr.icns` 位于 Bundle 内。`.pkg` 以稳定 package identifier 升级完整 Bundle，并以安装事务中的故障注入验证失败回滚；安装前 ownership guard 只允许缺失的 `/usr/local/bin/buildr` 或已有同一 platform receipt 的 symlink，遇到 npm/development/foreign entry 时保留原物并 fail closed。签名、公证、staple、`pkgutil` 与 Gatekeeper 都是正式门禁。

Windows 选择 per-user MSI，默认安装到 `%LOCALAPPDATA%\Programs\Buildr`，避免普通用户安装必须取得管理员权限。目录内唯一实际 SEA 是 `buildr.exe`；用户 PATH registration 与 Start Menu 的 `Buildr Web` shortcut 都指向它，并使用正式 `Buildr.ico`。shortcut 命令仍是 `web`；附加的内部 `--platform-launcher` marker 只让同一 SEA 识别图形失败反馈模式，入口归一化后不会进入公开 CLI 参数或形成另一套 Launcher 实现。macOS Bundle 无参入口使用同一模式。图形启动失败时 SEA 写入用户日志并显示包含 channel、payload identity、日志位置和重试动作的简短提示；普通 CLI 失败仍只遵循 stderr/JSON 契约。MSI 使用稳定 UpgradeCode、版本化 ProductCode 和 Windows Installer transaction 完成 major upgrade、重复安装、回滚、repair 与卸载，并登记准确的 Apps & Features 信息。development channel 使用不同目录、shortcut、identity 与 upgrade code。

平台卸载只删除 installer 拥有的 executable、资源、CLI link/PATH entry、shortcut、receipt 和卸载 metadata。Workspace Registry、Workspace SQLite、Workspace assets、Agent runtime 与日志位于安装单元之外，默认保留。物理清理只接受 ownership receipt 和安装 root 的双重证明。

### 6. 安装来源由不可变 identity 与 receipt 证明

公共 payload manifest 描述 Buildr 与协议；每个渠道另有 closed installation-origin envelope。平台 envelope 嵌入已签名产品并由 installer 写入 ownership receipt；npm envelope 来自 pack staging 的 package identity；development envelope 绑定 checkout root、commit 和明确的 development host runtime。当前进程启动时解析并校验 envelope，将其传给 update、status、Doctor 和 Web instance identity。PATH、文件名或目录形状只能作为诊断线索，不能决定来源。

`buildr update` 对 npm 来源只更新相同 package/prefix；对平台来源只接受完整、签名且与当前 channel 匹配的 installer update，不得调用 npm 或原地替换部分文件；对 development 来源只推进绑定 checkout/development launcher。Workspace Node 的准备或升级不属于任何产品 update，产品升级也不得修改 `.buildr/workspace.yml` 或对应受管 runtime。

### 7. release workflow 冻结一个 release set 后才进入不可逆阶段

tag workflow 首先解析唯一 release contract，绑定 tag、commit、package version、dist-tag、Node version、支持矩阵、asset filenames、release notes 与显式上一代平台发布 lineage。首代必须由只读 GitHub Release 历史证明不存在既有正式平台 manifest；后续 generation 必须由版本控制中的 closed authority 精确绑定上一代 tag/commit、manifest digest、payload digest 及各目标 installer filename/size/SHA-256。原生 job 从上一 tag 公共 Release 下载并逐字节核对对应 installer，再把它作为升级与事务回滚 verifier 的唯一 previous input；缺失或漂移立即停止。公共 payload 与 npm tarball 各构建一次；原生 job 对每个平台 artifact 各构建一次。冻结候选通过 inventory、SEA、最终 installer 安装、升级/回滚/卸载、无系统 Node/PATH、CLI/Web/health、普通 CLI 不启动 HTTP、签名、体积、manifest/checksums 等全部可逆验证后，受保护 Environment 才允许公开写入。

正式 tag 模式缺少 macOS Developer ID/Installer/notary 或 Windows Authenticode/MSI signing 条件时必须 fail closed。非 tag 的开发验证可以生成明确标记 `unsigned-candidate` 的本地/GitHub Actions evidence，但它不能使用正式 filename、进入 Release manifest 或通过 release-ready gate。

发布阶段复用冻结 bytes。npm Registry 只接收 tarball；GitHub Release Assets 只接收平台 installers、`buildr-v<version>-release-manifest.json`、`buildr-v<version>-checksums.txt` 和必要签名材料。ensure 先核对 Release 的 tag、target commit、notes/prerelease/Latest，再逐个核对 asset filename、size 和下载后 SHA-256：缺少时补齐、完全相同时复用、漂移时停止且不覆盖。部分成功后的同 tag 重跑从 registry/Release 公共事实恢复，不重建或重签已冻结候选。

发布后，原生 readback job 从对应 GitHub Release 公共 URL 重新下载安装；npm readback 从 Registry 安装精确 version。两者都核对 manifest/checksums 并重跑安装后 smoke。GitHub Actions artifact 只保留冻结 bytes、构建 provenance、日志和验证报告，不写入 README、官网或安装脚本的公共下载地址。

### 8. manifest 同时表达 payload、平台层和最终 bytes

release manifest 对每项平台资产记录：Buildr version、protocol identity、Product Node version、platform、architecture、`applicationPayloadDigest`、final SHA-256、size、filename、source commit/tag、签名状态、压缩前/安装后 size 与 inventory summary。npm 条目记录相同 payload digest、tarball SHA-256/SHA-512 integrity、宿主 Node engines 和 inventory summary，但 Product Node 为 `null` 且 channel 为 `npm`。checksums 只列最终公开文件的 SHA-256，排序与换行稳定，并由测试逐字节核对。

manifest 不能包含 secret、certificate private material、本机绝对路径或临时 artifact URL。签名 subject、certificate fingerprint、公证 request/result identity 可以作为公开 provenance。schema 与 closed enum 进入 public JSON registry。

## Risks / Trade-offs

- [SEA bundle 遇到动态 import、worker 或模块相对资源语义] → 关闭 code cache/snapshot，集中资源解析，物化 worker，并以禁止裸 `import.meta.url`/`process.execPath` 假设的架构测试保护；无法满足时 fail closed。
- [同一 payload 在多个 runner 上被意外重建] → 由单一 payload job 生成 digest，所有下游只下载并校验冻结 evidence，release manifest 拒绝不同 digest。
- [macOS x64 或 Windows x64 原生安装验证不可用] → 该 target 保持声明但不得进入 publish job/manifest；恢复原生 gate 后才能发布。不能用 cross-build 或本机 staging 替代。
- [签名和公证改变最终 bytes] → 所有最终 digest、size、checksums 和上传都在签名、公证、staple 完成后计算；重跑复用已冻结 signed candidate。
- [per-user MSI 与命令行 PATH 刷新存在会话延迟] → installer 同时验证 registry PATH ownership 与绝对路径 CLI，新的 shell smoke 再验证 PATH；不修改 machine PATH。
- [macOS CLI symlink 需要 system installer 权限] → `.pkg` 明确以 system install unit 管理 Bundle 与 owned symlink，安装失败由 Installer transaction 回滚；不在用户 shell profile 写入隐式命令。
- [平台更新与用户数据边界不清导致误删] → 产品单元和 user/workspace state 使用不同根，卸载只处理 receipt 证明的 owned paths，并对保留数据做前后 digest/assertion。
- [工作流在一个公开写入后失败] → Registry/Release ensure 和 readback 都以 tag、commit、digest 为恢复 authority，只补齐缺失事实，任何漂移停止且不覆盖。
- [新增 bundler、SEA injector 或 installer toolchain 增加供应链面积] → 依赖锁定、许可证 inventory、官方 checksum、构建 provenance 和开源候选扫描同时更新。

## Migration Plan

1. 建立 payload builder、稳定 manifest/schema、资源 resolver 与 process execution abstraction；保持 checkout CLI 测试通过。
2. 让 npm pack staging 只消费冻结 payload，删除 tarball 中的平台 Launcher 与 Node 内容，并补齐 host Node CLI/Web smoke。
3. 在原生构建脚本中加入 Node `24.15.0` 获取校验、SEA 注入、macOS/Windows product layout 和 unsigned candidate 验证。
4. 加入安装来源 receipt、update 路由、Doctor/status 多渠道 read model；迁移既有 Buildr-owned Launcher 时只处理可证明 ownership 的路径。
5. 加入签名、公证、installer、manifest/checksums、size/inventory 与 lifecycle verifier；生产模式缺少凭证时保持 fail closed。
6. 重构 `publish.yml` 为 contract/payload、原生 build/verify、protected publish、Registry/Release public readback 阶段；保留同一 run artifact 作为 evidence。
7. 更新 current knowledge、术语表、发布清单、verification declaration 与文档，运行严格 OpenSpec、affected/full Candidate 和可在当前环境执行的平台结构验证。
8. 本 Task 只形成 Development Handoff；真实 tag、发布、凭证配置、上传、推送和 Task Finish 等待独立授权。

回滚策略是保留旧 npm 安装和旧正式平台产品单元，只有新 tarball/installer 完成 staging、identity 与 native lifecycle gate 后才替换。平台 installer 失败依赖系统事务回滚；更新失败不得修改 Workspace state。发布 workflow 一旦产生公开事实，不删除或覆盖，而由同 tag ensure 继续补齐。

## Open Questions

没有阻塞实现的产品模型问题。生产证书、Apple notarization profile、Windows signing provider、GitHub Environment 审批与 npm Trusted Publisher 是后续真实发布条件；本任务只能实现并测试它们的输入契约和缺失时的 fail-closed 行为。
