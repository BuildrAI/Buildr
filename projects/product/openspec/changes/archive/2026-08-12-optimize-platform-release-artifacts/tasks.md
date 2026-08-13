## 1. 冻结应用负载契约

- [x] 1.1 在 `buildr` Service 中建立 release contract 与 application payload builder，规范化 Buildr/protocol/source identity、文件 mode/size/SHA-256 和稳定排序，证明相同输入重复构建得到相同 manifest 与 `applicationPayloadDigest`
- [x] 1.2 将 CLI、Core/Application、Buildr Web HTTP/runtime、提交到 `buildr/web-dist` 的正式静态资源、SQLite migrations、package baseline、生产依赖和许可证收敛到单一 payload inventory，确认无需修改 `buildr-web` source/build contract
- [x] 1.3 增加 digest-verified resource resolver 与 installer-owned immutable resource directory/cleanup，移除 runtime 对 development checkout、cwd 和未校验相对资源的依赖
- [x] 1.4 将可注入 runtime JavaScript bundle 为 Node SEA 可执行的单一 CommonJS 入口，锁定 bundler/injector 依赖、lockfile 与许可证 inventory，并保持 `node:*` builtin 的显式边界
- [x] 1.5 枚举现有 `process.execPath`、动态 import、worker 与脚本重入路径，分别迁移到 product re-entry、进程内 worker 或 Workspace Node execution abstraction，并增加禁止把 SEA executable 当通用 Node 的架构检查
- [x] 1.6 为 `buildr.application-payload/v1` 增加 closed schema、registry 和 unit/contract tests，拒绝绝对路径、构建时间、secret 与渠道特有 Node/installer 字段

## 2. 收敛 npm 渠道

- [x] 2.1 重构 npm pack staging，使 `@buildr-ai/buildr` 只消费冻结 payload，并由薄 CLI entry 使用满足 `engines.node` 的 host Node 执行同一 runtime bundle
- [x] 2.2 从 npm `files`/inventory 删除 Node executable、平台 Launcher、`.app/.pkg/.msi`、shortcut/VBS、installer/signing toolchain、测试、fixtures、source maps 与开发依赖，同时保留完整 CLI、verification runtime 与 `buildr web`
- [x] 2.3 让 release artifact builder 在一次 `npm pack` 后冻结 tarball filename、size、SHA-256、SHA-512 integrity、inventory 与 payload digest，后续 smoke/publish/readback 只接受该 tarball
- [x] 2.4 扩展 tarball inventory/parity smoke，在隔离 prefix 与多个兼容 host Node 上验证 `buildr --help`、代表性 CLI、`buildr web --no-open`、health/readiness，并断言普通 CLI 不启动 HTTP
- [x] 2.5 增加不兼容 host Node 的 fail-closed 测试，证明 npm entry 不下载 Product Node、不切换 Workspace Node且不从 PATH 选择替代 Node

## 3. 分离 runtime role 与安装来源

- [x] 3.1 建立 `product|host|workspace|development|unknown` runtime role 与 `npm|platform|development|unknown` installation channel 模型，使当前进程从 embedded identity/ownership receipt 取得来源而不是猜 PATH、文件名或目录形状
- [x] 3.2 固定平台主进程使用 embedded Product Node、npm 主进程使用启动 package 的 host Node、development 主进程使用 identity 绑定的 development host Node；只让 Workspace-owned npm、verification、Finish adapter 与项目命令通过 `.buildr/workspace.yml` 精确 Workspace Node resolver 执行
- [x] 3.3 为 Product、npm host、development host 与 Workspace Node 增加独立 identity、更新、卸载与 execution evidence 测试，覆盖版本相同仍不合并、产品升级不改变 Workspace Node、Workspace Node 升级不改变产品/npm/development runtime
- [x] 3.4 扩展 `buildr update check/update` 来源解析与路由：npm 只更新相同 package/prefix，platform 只协调完整签名 installer，development 只推进绑定 checkout，unknown fail closed
- [x] 3.5 扩展 Doctor/status read model，分别展示 npm CLI、正式 platform installation、Buildr Web Dev 与 current instance 的版本、路径、runtime role/source、protocol、payload 与 ownership identity
- [x] 3.6 为 installation inventory/update/status 的公共 JSON family 增加 closed schema、registry 与 checkout/npm/platform parity tests，确保不泄露 secret、SQLite path 或私钥材料

## 4. 构建通用 SEA 候选

- [x] 4.1 实现官方 Node `24.15.0` target resolver/downloader，按 platform/architecture 校验官方 checksum、只提取运行需要的 executable/动态库并保留 Node license/provenance
- [x] 4.2 实现使用同版本 Node 生成 SEA blob、清除可移除原签名并注入 `NODE_SEA_BLOB` 的 builder，显式关闭 snapshot/code cache 并禁止完整 Node directory fallback
- [x] 4.3 组装唯一 SEA 与 digest-verified payload resource directory/channel envelope，验证 CLI 与 `web` 共用同一 Buildr implementation、内置 `node:sqlite`、动态加载、worker 和 migrations
- [x] 4.4 增加 SEA 结构/inventory/identity smoke：污染 PATH、隐藏 system Node 后运行 help、代表性 CLI、Web health/readiness，并断言普通 CLI 无 HTTP listener且安装目录无第二份 Node/Buildr executable
- [x] 4.5 为 SEA blocker 建立 fail-closed diagnostic 与最小复现 evidence，测试 bundle/SQLite/resource/signing 任一必要条件失败时不会回退完整 Node tree或发布 unsigned 正式 identity

## 5. 实现 macOS 产品单元

- [x] 5.1 生成 `Buildr Web.app` layout：Bundle 仅含一份 `Contents/MacOS/buildr` SEA、同 digest resources/identity/licenses，`CFBundleExecutable` 直接使用该 SEA，并由其 Bundle 无参入口执行 `web` command
- [x] 5.2 实现 `.pkg` 组装与稳定 package ownership，使 `/Applications/Buildr Web.app`、CLI symlink/receipt 作为同一产品单元安装，并与 `Buildr Web Dev`、npm prefix 和 user/workspace state 分根
- [x] 5.3 实现完整升级、同版本重复安装、故障回滚和 canonical uninstall 路径，只清理 receipt 证明的 Bundle/link/metadata，默认保留 Workspace Registry、SQLite、assets、Agent runtime 与日志
- [x] 5.4 实现 SEA 注入后 app/installer 签名、notarization、staple、`codesign`、`pkgutil` 与 Gatekeeper 门禁；正式模式缺少任一生产条件时 fail closed，非发布模式只输出明确 `unsigned-candidate` evidence
- [x] 5.5 增加 `darwin-arm64` 与 `darwin-x64` 原生 job/script 契约及最终 pkg lifecycle verifier，记录 payload/SEA/pkg/installed size 与 inventory breakdown，不以 staging directory 代替安装验证

## 6. 实现 Windows per-user 产品单元

- [x] 6.1 生成 per-user MSI layout，默认安装 `%LOCALAPPDATA%\Programs\Buildr` 且目录只有一份 `buildr.exe` SEA；用户 PATH 与 Start Menu `Buildr Web` shortcut 指向同一 executable，shortcut 参数为 `web`
- [x] 6.2 配置稳定 UpgradeCode、版本化 ProductCode、Apps & Features metadata、repair/重复安装/major upgrade/transaction rollback 与 uninstall ownership，使用独立 development channel location/shortcut/identity
- [x] 6.3 实现 executable 与 MSI Authenticode signing/timestamp/verification 门禁；正式模式缺少生产 signing 条件时 fail closed，unsigned candidate 不得取得正式 filename/manifest identity
- [x] 6.4 增加 `windows-x64` 原生 job/script 契约及最终 MSI installation verifier，覆盖 PATH、Start Menu、help/CLI/Web、升级/回滚/卸载、数据保留、channel 隔离与 size/inventory
- [x] 6.5 将 `windows-arm64` 排除首发 matrix、filename、manifest 与 workflow expansion，并增加只有正式声明加原生 build/sign/install verification 后才能启用的 fail-closed 测试

## 7. 冻结 release set 与公开资产契约

- [x] 7.1 实现唯一 release contract parser，绑定 `v<version>`、source commit、package version/dist-tag、Node `24.15.0`、`darwin-arm64|darwin-x64|windows-x64`、asset filenames 与 changelog notes
- [x] 7.2 实现 `buildr.release-manifest/v1` 与稳定 checksums aggregator，在全部 signing/notarization/staple 后记录 npm/platform filenames、payload digest、final digests/integrity、sizes、Node/platform/architecture、source commit/tag 与签名 provenance
- [x] 7.3 实现 GitHub Release ensure planner/executor，按 tag/target commit/notes/prerelease/Latest 与 asset filename/size/public SHA-256 处理 missing、identical、drift、partial-rerun，禁止 overwrite/delete/re-sign
- [x] 7.4 增加无真实 GitHub mutation 的 ensure 契约 fixtures，覆盖缺失创建/上传、完全相同复用、同名漂移阻塞和部分成功只补齐缺失事实
- [x] 7.5 实现 npm Registry 与 GitHub Release Assets 的有界 public readback，分别安装精确 package 与最终 installer、核对 manifest/checksums，并保持公开 URL 只指向 npm Registry 或对应 tag Release

## 8. 重构发布 workflow

- [x] 8.1 将 `.github/workflows/publish.yml` 拆为 release contract/payload、唯一 npm pack、原生 platform build/verify、aggregate gate、受保护 publish/ensure 与公共 readback 阶段
- [x] 8.2 让全部可逆 payload/npm/platform inventory、最终 installer lifecycle、签名、公证与 size gate 在任何 `npm publish`、GitHub Release create 或 asset upload 前完成，任一失败阻断全部公开写入
- [x] 8.3 让每个下游 job 校验并复用同一 frozen payload/tarball/signed installer bytes；GitHub Actions artifact 只保存候选与 evidence，不被 README、官网或安装脚本用作公共下载
- [x] 8.4 为 npm Trusted Publishing、macOS signing/notary、Windows signing 与 GitHub Environment approval 增加最小权限、OIDC/secret 输入和 fail-closed preflight，不配置或读取任何真实凭证
- [x] 8.5 增加 workflow/脚本测试，证明正式 tag 缺签名条件会在公开写入前失败，部分成功重跑复用 registry/Release 一致事实且不重复 pack/build/sign/publish

## 9. 收敛验证能力与当前认知

- [x] 9.1 将 common payload/release contract、macOS installer 与 Windows installer 的 stable verifier entrypoints 登记到 Product verification declaration/registry，并为 affected/full Candidate 配置明确 owner、platform、cost、dependency 与 timing
- [x] 9.2 扩展 package/release/system tests，逐字节验证 npm/SEA/installer inventory、manifest/checksums、runtime role、无 system Node、唯一 executable、HTTP 按需、install lifecycle、data retention 与 channel isolation
- [x] 9.3 更新 release checklist，明确首发 matrix、真实签名/公证/Environment/OIDC 前置条件、不可逆授权边界、GitHub Release Asset ensure/readback 与失败恢复步骤
- [x] 9.4 使用 current knowledge maintenance 更新 Product overview、technical/product architecture、Buildr Service 与 release flow 中真实受影响内容，不创建空目标，并在 `.buildr/knowledge-impact.yml` 记录 canonical/current/brief 影响与验证 evidence
- [x] 9.5 使用 terminology governance 将应用负载、Product Node、host Node、Workspace Node、平台产品单元与 release artifact set 的确认边界写入 canonical glossary，保持 Buildr Web Launcher 与未来 Buildr App 不混用
- [x] 9.6 创建/刷新同级 `brief.md`，用用户可读方式说明双渠道模型、runtime lifecycle、首发 matrix、验证范围与仍需真实发布授权的外部条件

## 10. 直接验证与 archive readiness

- [x] 10.1 运行 lint/static/unit/component/contract/integration 与 affected verification，修复 payload、JSON、update/Doctor、SEA、installer、ensure 和 workflow 回归，并记录各阶段真实耗时
- [x] 10.2 在当前可用原生环境执行不产生发布副作用的 npm/SEA/final installer smoke；对不可用的 Windows/生产签名/公证只接受 fail-closed contract evidence并明确记录尚缺外部条件，不冒充正式验证
- [x] 10.3 运行完整 Product Candidate 或声明的等价 full profile，确认同一冻结 artifact 被所有 verifier 复用、最终报告包含制品矩阵、压缩/安装 size、Node/payload identity、验证范围与耗时
- [x] 10.4 运行 `openspec validate optimize-platform-release-artifacts --strict` 与 current-knowledge/terminology/verification consistency checks，确认 proposal/design/specs/tasks/brief/knowledge impact 与实现一致并达到 convergence/archive readiness
- [x] 10.5 审计任务 effects，确认没有创建 tag、执行 `npm publish`、创建/修改真实 GitHub Release、上传正式 assets、配置真实签名密钥、推送发布分支或执行 Task Finish
