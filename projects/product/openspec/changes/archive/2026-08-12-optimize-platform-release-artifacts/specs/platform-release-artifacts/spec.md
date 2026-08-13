## ADDED Requirements

### Requirement: 平台制品必须使用精确 Product Node SEA
Buildr 正式平台制品 MUST 以目标平台官方 Node `24.15.0` executable 构建 SEA，并 MUST 将冻结的公共 runtime bundle 注入该 executable。平台 runtime MUST NOT 从 PATH、系统 Node、npm prefix 或 development checkout 查找 Node；不得以完整 Node 官方开发发行目录替代 SEA。

#### Scenario: 构建 SEA
- **WHEN** 原生 job 为声明的 platform/architecture 构建平台候选
- **THEN** builder MUST 校验官方 Node checksum，并用完全相同 Node version 生成和注入 SEA blob
- **AND** candidate identity MUST 报告 Product Node `24.15.0`、Buildr version、platform、architecture 与 `applicationPayloadDigest`

#### Scenario: SEA blocker
- **WHEN** runtime bundle、SQLite、动态加载、资源访问或签名无法在 SEA 中满足正式路径
- **THEN** build MUST fail closed 并保存可复现 blocker evidence
- **AND** MUST NOT 静默复制 Node headers、npm/npx、文档、测试或完整 Node directory 作为 fallback

### Requirement: SEA 注入必须先于平台签名和最终摘要
平台 builder MUST 在 SEA 注入与资源组装完成后才执行 executable/installer 签名；macOS 公证和 staple 也 MUST 在最终 artifact SHA-256 之前完成。正式 tag 模式缺少生产签名或公证输入时 MUST fail closed，且 unsigned/ad-hoc artifact MUST NOT 使用正式发布 identity。

#### Scenario: macOS 正式候选
- **WHEN** tag workflow 构建 macOS `.pkg`
- **THEN** SEA 与 app bundle MUST 先完成 Developer ID 签名，再由签名 installer 进入 notarization 和 staple
- **AND** `codesign`、`pkgutil`、notary result 与 Gatekeeper 任一门禁失败 MUST 阻止正式 asset

#### Scenario: Windows 正式候选
- **WHEN** tag workflow 构建 Windows `.msi`
- **THEN** injected `buildr.exe` 与 MSI MUST 使用生产 Authenticode 条件签名并验证证书链与 timestamp
- **AND** executable 或 MSI 未签名、签名无效或安装验证失败 MUST 阻止正式 asset

#### Scenario: 非发布验证缺少凭证
- **WHEN** pull request 或本地验证没有生产签名条件
- **THEN** builder MAY 生成明确标记为 `unsigned-candidate` 的临时证据
- **AND** 该证据 MUST NOT 进入 release manifest、正式 filename、GitHub Release Assets 或 release-ready 结论

### Requirement: macOS pkg 必须安装一个原子产品单元
macOS 正式制品 MUST 是可签名、公证和 Gatekeeper 验证的 `.pkg`，安装 `Buildr Web.app` 作为完整产品单元。Bundle MUST 只有一份实际 Buildr SEA executable；图形入口 MUST 执行同一 executable 的 `web` 命令，CLI shim/symlink MUST 指向该 executable。

#### Scenario: 安装 macOS pkg
- **WHEN** verifier 在匹配 architecture 的干净 macOS 环境安装最终 `.pkg`
- **THEN** `/Applications/Buildr Web.app` MUST 包含唯一实际 SEA、匹配 payload resources、identity 与许可证
- **AND** CLI link 与图形入口 MUST 解析到同一 SEA，不得存在第二份 Node 或 Buildr executable

#### Scenario: 更新和失败回滚
- **WHEN** verifier 安装较旧版本后升级到候选，或在安装切换阶段注入失败
- **THEN** installer MUST 原子替换整个 Product Node、CLI、Web、Launcher 和 product identity 单元
- **AND** 失败 MUST 保留上一完整可启动产品单元，不得留下混合版本

#### Scenario: 卸载 macOS 产品
- **WHEN** 用户通过 canonical 平台卸载入口移除 Buildr
- **THEN** uninstaller MUST 只移除 pkg 拥有的 Bundle、CLI link、receipt 与入口 metadata
- **AND** MUST 保留 Workspace Registry、SQLite、Workspace assets、Agent runtime 与日志

### Requirement: Windows MSI 必须提供 per-user 单 executable 安装
Windows 正式制品 MUST 是可签名的 per-user `.msi`，默认安装到 `%LOCALAPPDATA%\Programs\Buildr`。安装目录 MUST 只有一份实际 `buildr.exe` SEA；用户 PATH entry 与 Start Menu `Buildr Web` shortcut MUST 指向该安装，shortcut MUST 以 `web` 参数执行同一 executable。

#### Scenario: 安装 Windows MSI
- **WHEN** 普通用户在匹配 architecture 的干净 Windows 环境安装最终 MSI
- **THEN** 安装 MUST 不要求系统 Node、npm 或管理员级 machine PATH mutation
- **AND** Apps & Features MUST 展示准确 publisher、version、install location 与 uninstall command

#### Scenario: Windows 重复安装与升级
- **WHEN** verifier 重复安装同版本或以稳定 UpgradeCode 安装更高版本
- **THEN** Windows Installer MUST repair/reuse 相同产品或事务性升级整个产品单元
- **AND** 失败回滚 MUST 保留上一完整版本且不得覆盖 development channel

#### Scenario: Windows 卸载
- **WHEN** verifier 通过 MSI 卸载产品
- **THEN** installer MUST 移除 owned executable、resources、用户 PATH entry、Start Menu shortcut 与卸载登记
- **AND** MUST 保留 Workspace Registry、SQLite、Workspace assets、Agent runtime 与日志

### Requirement: 正式平台矩阵必须只包含原生验证 target
首个声明的正式平台矩阵 MUST 为 `darwin-arm64`、`darwin-x64` 和 `windows-x64`，并 MUST 为每个 target 使用平台原生 job 构建与安装验证。`windows-arm64` 或其他 target 只有在规范、构建、签名和最终 installer 原生验证全部完成后才能加入正式 manifest。

#### Scenario: 声明矩阵全部通过
- **WHEN** 三个首发 target 都在原生 runner 完成 SEA、installer、签名与安装生命周期验证
- **THEN** release manifest MUST 只列出对应三份平台 installer
- **AND** filename MUST 分别匹配 `buildr-v<version>-darwin-arm64.pkg`、`buildr-v<version>-darwin-x64.pkg` 和 `buildr-v<version>-windows-x64.msi`

#### Scenario: target 未完成正式验证
- **WHEN** 某 target 缺少原生 runner、签名、公证、安装或 public readback 证据
- **THEN** workflow MUST 阻止整个已声明 release contract 或按显式缩窄后的新 contract 重新开始
- **AND** MUST NOT 发布未经验证的 architecture 或临时 unsigned artifact

#### Scenario: Windows arm64 尚未验证
- **WHEN** workflow 处理当前首发 release contract
- **THEN** MUST NOT 构建或发布 `buildr-v<version>-windows-arm64.msi`
- **AND** manifest/checksums MUST NOT 暗示该 target 受支持

### Requirement: release manifest 与 checksums 必须证明最终公开 bytes
每次平台 release set MUST 包含 `buildr-v<version>-release-manifest.json` 与 `buildr-v<version>-checksums.txt`。Manifest MUST 对每项资产记录 Product Node version、Buildr version、protocol identity、platform、architecture、application payload digest、final artifact SHA-256、size、filename、source commit/tag、签名状态以及压缩前/安装后 size；checksums MUST 与最终文件逐字节一致。

#### Scenario: 生成最终 manifest
- **WHEN** executable/installer 签名、公证和 staple 已完成
- **THEN** aggregator MUST 从冻结 final bytes 计算 size 与 SHA-256，并生成排序稳定的 manifest/checksums
- **AND** MUST NOT 复用签名前、staple 前或 staging directory 的 digest

#### Scenario: inventory 与体积解释
- **WHEN** verifier 记录 installer 压缩前、最终下载和安装后 size
- **THEN** evidence MUST 证明不包含 Node headers、npm/npx、Node 文档、测试、fixtures、source maps、开发依赖或完整 Node tree
- **AND** MUST 按 SEA executable、payload resources、Web dist、licenses、installer/signature overhead 解释剩余体积

### Requirement: GitHub Release Assets 必须使用不可覆盖 ensure 与公共 readback
平台 installers、release manifest、checksums 和必要签名材料 MUST 只发布到对应 `v<version>` GitHub Release Assets。Ensure MUST 对 Release 核对 tag、target commit 与 release metadata，对每个 asset 核对 filename、size 和下载后 SHA-256；缺失 MUST 补齐，相同 MUST 复用，漂移 MUST fail closed 且不得覆盖。

#### Scenario: Release 或 asset 缺失
- **WHEN** 对应 tag 的 Release 或声明 asset 尚不存在且发布已获授权
- **THEN** workflow MUST 创建缺失 Release 或只上传缺失 asset
- **AND** 已存在且一致的公开事实 MUST 保持不变

#### Scenario: asset 完全相同
- **WHEN** 同名 asset 已存在且 tag、commit、filename、size 与 SHA-256 全部匹配冻结 manifest
- **THEN** ensure MUST 复用该 asset 并记录 public readback evidence
- **AND** MUST NOT 重新上传、重新签名或改变 Release metadata

#### Scenario: asset 漂移
- **WHEN** Release 或任一同名 asset 的 commit、metadata、size 或 digest 与冻结 contract 不同
- **THEN** ensure MUST 停止且不得删除、覆盖或重命名远端事实
- **AND** diagnostic MUST 标明期望与实际 identity 及需要人工处理的下一步

#### Scenario: 部分成功后重跑
- **WHEN** 上次 workflow 已上传部分一致 assets 后失败
- **THEN** 同 tag 重跑 MUST 只补齐缺失 assets 并复用全部一致 assets
- **AND** MUST NOT 从 checkout 重建、重签或替换已冻结 bytes

#### Scenario: 公共地址重新验证
- **WHEN** Release Assets ensure 完成
- **THEN** 原生 readback job MUST 从公开 GitHub Release URL 重新下载最终 installer、manifest 与 checksums
- **AND** MUST 在没有系统 Node 的安装环境完成 CLI、Web、health 和卸载 smoke，并核对每个 byte digest

