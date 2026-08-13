## ADDED Requirements

### Requirement: 平台候选必须验证最终 installer 而非 staging
Product Candidate MUST 对每个声明 target 使用完成注入、签名、公证/staple 与 packaging 的最终 `.pkg`/`.msi` 执行安装后验证；source checkout、未签名 staging directory、裸 SEA 或解包后的文件 MUST NOT 代替 installer lifecycle evidence。

#### Scenario: 无系统 Node 的最终安装 smoke
- **WHEN** 原生 verifier 在移除或污染 PATH 且没有 system Node 的干净环境安装最终 installer
- **THEN** `buildr --help`、代表性 CLI、`buildr web --no-open` 与 health/readiness MUST 正常
- **AND** 代表性非 Web CLI MUST NOT 启动 HTTP service，所有运行 MUST 使用 installed SEA 与 payload resources

#### Scenario: 单 executable 与入口一致
- **WHEN** verifier 检查安装 inventory 并分别通过 CLI 与图形入口启动
- **THEN** 产品单元 MUST 只有一份实际 Product Node/SEA executable，CLI 与 Launcher MUST 引用它
- **AND** 两个入口 MUST 报告相同 Buildr、Product Node、protocol、payload 与 platform identity

#### Scenario: 安装生命周期矩阵
- **WHEN** verifier 依次执行首次安装、首次启动、同版本重复安装、升级、故障注入回滚和卸载
- **THEN** 每个阶段 MUST 验证版本/identity、owned files、PATH/link/shortcut、运行状态与回滚结果
- **AND** generation 1 只有在 Release history preflight 证明不存在上一代正式平台资产后，升级阶段 MUST 明确记录 `not-applicable-first-platform-release`；generation 2 及以后 MUST 从 frozen previous installer 升级到当前候选
- **AND** 卸载后 Workspace Registry、SQLite、Workspace assets、Agent runtime 与日志 MUST 与安装前/运行后保留证据一致

#### Scenario: 正式与 development channel 隔离
- **WHEN** 同一主机同时存在正式平台安装、npm CLI 与 Buildr Web Dev
- **THEN** 安装、升级、启动、停止和卸载任一 channel MUST 不改变其他 channel 的 files、receipt、shortcut 或 instance
- **AND** status/Doctor MUST 分别识别各 channel 与当前运行实例

### Requirement: Node runtime role 验证必须覆盖主进程与 Workspace subprocess
Product verification MUST 证明平台 Buildr 主进程使用 Product Node、npm Buildr 主进程使用 compatible host Node、Workspace-owned subprocess 使用精确 Workspace Node，并 MUST 证明产品升级不改变 Workspace Node。测试 MUST 使用可区分版本或独立 identity receipt，不能仅因版本字符串相同判断通过。

#### Scenario: 三类 runtime 同时存在
- **WHEN** 测试 Workspace 声明精确 Node，平台/npm 主进程分别执行 Workspace-owned verification
- **THEN** runtime evidence MUST 分别标记 `product`、`host` 和 `workspace` role、路径与 identity
- **AND** Workspace subprocess MUST 匹配声明，两个 Buildr 主进程 MUST 保持各自启动 runtime

#### Scenario: 产品升级保持 Workspace runtime
- **WHEN** verifier 升级平台 Buildr 后重新执行相同 Workspace-owned command
- **THEN** Product Node/Buildr identity MUST 更新而 Workspace Node identity 与 on-disk runtime digest MUST 不变
- **AND** npm host Node 与 development channel MUST 不受平台升级影响

### Requirement: 平台签名、结构与体积必须是 Candidate 门禁
Candidate MUST 对 macOS 验证 Bundle/pkg 结构、codesign、installer signature、notarization ticket 与 Gatekeeper，对 Windows 验证 MSI table、per-user location、PATH、Start Menu、Authenticode、安装/卸载登记。每项 artifact MUST 记录 payload size、SEA size、installer download size 与 installed size，并解释主要组成。

#### Scenario: 携带不需要的 Node 开发内容
- **WHEN** inventory 发现 Node headers、`include/`、npm/npx、Node docs、测试、fixtures、source maps、development dependencies、`buildr-web` source 或 Vite toolchain
- **THEN** candidate MUST fail 并列出路径与体积
- **AND** MUST NOT 仅以总制品低于某一阈值替代 inventory 断言

#### Scenario: 平台结构或签名不完整
- **WHEN** 任一 target 的 installer layout、唯一 executable、签名、公证/Gatekeeper、MSI PATH/shortcut 或 uninstall check 失败
- **THEN** 对应 target MUST NOT 进入 release manifest
- **AND** 已声明正式矩阵存在任一失败时 publish gate MUST fail closed

### Requirement: manifest、checksums 与 asset ensure 必须具有契约测试
Verification MUST 逐字节核对 release manifest、checksums、payload digest 与实际冻结 artifacts，并 MUST 对 GitHub Release/Asset ensure 的 missing、identical、drift 与 partial-rerun 分支执行无真实发布副作用的契约测试。

#### Scenario: manifest 字节漂移
- **WHEN** filename、size、SHA-256、Buildr/Product Node/platform/architecture、payload digest 或 source commit/tag 任一值与真实 artifact 不同
- **THEN** aggregator/readback verification MUST fail before publish or report public drift after publish
- **AND** MUST NOT 重写 manifest 来适配未知 bytes

#### Scenario: ensure 四分支
- **WHEN** fixture 分别提供缺失、完全相同、同名不同摘要和部分已存在 assets
- **THEN** plan MUST 分别为 create/upload、reuse、blocked 和 fill-missing
- **AND** test MUST 断言没有 overwrite/delete/unpublish path

## MODIFIED Requirements

### Requirement: 正式发布必须围绕一个不可变 tarball 收敛
Buildr 正式 tag 发布 workflow MUST 将一次 `npm pack` 产生的 tarball 保持为唯一 npm artifact，同时将一次公共 application payload 与每个平台各构建一次的最终 installer 冻结为同一 immutable release artifact set。发布前 smoke、`npm publish`、GitHub Release Asset upload、CI evidence、registry integrity 与公共 asset readback MUST 绑定该集合的 manifest identity；workflow MUST NOT 在 tag 发布阶段重复 pack、重建 payload/installer 或重复运行完整 Candidate。

#### Scenario: 准备正式发布物
- **WHEN** 受保护 tag workflow 完成唯一 release contract 与 release notes 检查
- **THEN** workflow MUST 只构建一次 payload、只执行一次 `npm pack`，并在原生 job 为每个声明 target 只构建一次 final installer
- **AND** aggregator MUST 生成包含 package/version、payload digest、filenames、inventory、sizes、SHA-256、npm SHA-512 integrity、Node/platform identity 与 source commit/tag 的 manifest/checksums
- **AND** 全部 frozen bytes 与 evidence MUST 作为同一 run 的 GitHub Actions artifact 保存

#### Scenario: 发布前验证正式发布物
- **WHEN** release artifact set 已冻结
- **THEN** npm smoke MUST 从该 tarball 安装 CLI 并完成 host Node CLI/Web lifecycle，平台 smoke MUST 从 final installer 完成无 system Node 的安装/升级/回滚/卸载 lifecycle
- **AND** smoke MUST NOT 从 checkout 重新 pack/bundle/build installer，或使用 development checkout/staging runtime 冒充安装后产品

#### Scenario: 发布同一个 tarball
- **WHEN** 官方 npm registry 不存在目标 package version 且全部 npm/平台可逆门禁通过
- **THEN** workflow MUST 使用 trusted publishing 执行 `npm publish <tarball>` 并应用 release contract 指定的 dist-tag
- **AND** workflow MUST NOT 从checkout、目录或第二个pack结果隐式重建待发布bytes

#### Scenario: Registry 已存在目标版本
- **WHEN** 同一 tag workflow 重跑且官方 npm registry 已存在目标 package version
- **THEN** workflow MUST 比较 registry `dist.integrity` 与 frozen manifest 的 SHA-512 integrity，并核对 version/dist-tag contract
- **AND** identity 相同 MUST 跳过 publish，identity 不同 MUST fail closed 且不得覆盖、unpublish 或移动现有版本

#### Scenario: 发布后核对官方 registry
- **WHEN** publish 已成功或 registry 已有同 identity 版本
- **THEN** workflow MUST 以有界重试确认官方 registry 的 version、integrity 和目标 dist-tag
- **AND** workflow MUST 从官方 registry 安装精确 `name@version` 并完成与发布前相同的 host Node CLI/Web lifecycle smoke

#### Scenario: 上传同一平台 bytes
- **WHEN** GitHub Release 缺少 frozen manifest 声明的 installer、manifest、checksums 或签名材料
- **THEN** workflow MUST 只上传同一 release set 中已完成最终签名/公证与验证的 bytes
- **AND** MUST NOT 重新 build、重新 sign、重新 staple 或从 staging 生成替代 artifact

### Requirement: 正式发布恢复必须保留已完成的不可逆事实
Buildr 正式发布 workflow MUST 在 npm version、GitHub Release 或任一 Release Asset 已经存在时核对并复用一致事实，只补齐缺失步骤；任一 tag、commit、version、metadata、filename、size、digest 或 integrity 不一致 MUST fail closed。Workflow MUST NOT 通过删除 tag、重复 publish、unpublish、覆盖 Release/asset 或重签候选隐藏部分成功。

#### Scenario: GitHub Release 尚不存在
- **WHEN** 全部可逆 release-set gates 已通过且目标 GitHub Release 不存在
- **THEN** workflow MUST 从目标 CHANGELOG 章节创建指向同一 tag/commit 的 GitHub Release
- **AND** prerelease 与 Latest 状态 MUST 符合 release contract，后续 MUST 只上传 frozen manifest 中缺失 assets

#### Scenario: GitHub Release 已存在
- **WHEN** 同一 tag workflow 重跑且目标 GitHub Release 已存在
- **THEN** workflow MUST 核对 tag、target commit、body、prerelease/Latest 以及每个已存在 asset 的 filename、size 与下载 SHA-256
- **AND** 全部一致 MUST 复用 Release/assets，任一不一致 MUST fail closed 且不得自动覆盖

#### Scenario: 不可逆步骤后验证失败
- **WHEN** npm publish、GitHub Release create 或部分 asset upload 已成功，但后续 registry/asset readback、安装 smoke 或网络步骤失败
- **THEN** workflow MUST 保留已完成的 tag、npm version、dist-tag、Release 与 assets 事实并报告失败阶段
- **AND** 后续同一 tag 重跑 MUST 从 manifest identity 与公共 readback 恢复、只补齐缺失事实，不得重做已经成功的不可逆动作
