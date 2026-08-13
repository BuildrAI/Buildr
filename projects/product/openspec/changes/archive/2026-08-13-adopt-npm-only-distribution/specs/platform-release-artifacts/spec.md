## REMOVED Requirements

### Requirement: 平台制品必须使用精确 Product Node SEA
**Reason**: 当前产品阶段只正式分发依赖兼容 Host Node 的 npm package，不发布 Product Node 或 SEA。

**Migration**: 删除当前 SEA builder 与 Product Node supply chain；历史设计保留在已归档 Change，未来恢复必须重新验证届时 Node SEA 能力。

#### Scenario: npm-only 候选不构建 SEA
- **WHEN** 当前 Candidate 构建正式分发物
- **THEN** 构建 MUST 只产生 npm tarball
- **AND** MUST NOT 下载 Product Node 或注入 SEA

### Requirement: SEA 注入必须先于平台签名和最终摘要
**Reason**: 当前发布链不构建或签名 SEA。

**Migration**: npm tarball 继续在 pack 后冻结 SHA-256/SHA-512 integrity；未来平台渠道由新 Change 重新定义签名顺序。

#### Scenario: 当前候选不执行平台签名
- **WHEN** npm-only release workflow 运行
- **THEN** workflow MUST NOT要求 Developer ID、notary、Authenticode 或 SEA signing step
- **AND** MUST 继续核对 npm tarball integrity

### Requirement: macOS pkg 必须安装一个原子产品单元
**Reason**: 当前不发布 macOS PKG，macOS 图形入口由 npm 用户本机显式生成且不是产品安装单元。

**Migration**: 用户安装 npm package后按需运行 `buildr web launcher install`；该命令不得复制 Node 或 Buildr package。

#### Scenario: macOS 只生成本机 wrapper
- **WHEN** npm 用户显式安装 macOS Launcher
- **THEN** Buildr MUST 生成绑定同一 npm installation 的本机 `.app`
- **AND** MUST NOT 构建、下载或声称安装 `.pkg`

### Requirement: Windows MSI 必须提供 per-user 单 executable 安装
**Reason**: 当前不发布 Windows MSI，Windows 图形入口是 npm installation 生成的 Start Menu shortcut。

**Migration**: 用户通过 npm 安装 Buildr并显式安装 Launcher；未来企业或普通用户渠道需新 Change。

#### Scenario: Windows 只生成本机 shortcut
- **WHEN** npm 用户显式安装 Windows Launcher
- **THEN** Buildr MUST 生成绑定同一 npm installation 的 Start Menu shortcut
- **AND** MUST NOT 构建、下载或声称安装 `.msi`

### Requirement: 正式平台矩阵必须只包含原生验证 target
**Reason**: 当前没有正式平台 artifact matrix。

**Migration**: verification 只按 npm 支持的 Host Node 与本机 Launcher operating-system behavior 运行；不得从该测试声称存在 installer support。

#### Scenario: 当前没有 platform artifact matrix
- **WHEN** verifier 选择 release targets
- **THEN** targets MUST 只有唯一 npm tarball与适用的 Host Node/Launcher behavior jobs
- **AND** MUST NOT生成 darwin/windows installer asset filenames

### Requirement: release manifest 与 checksums 必须证明最终公开 bytes
**Reason**: 当前唯一公开 product bytes 是 npm tarball，其 SHA-256/SHA-512 integrity 与 Registry metadata 已提供唯一证明，不再发布平台 release manifest/checksums。

**Migration**: 保留 npm release-artifact manifest 作为 workflow 内部冻结 evidence，但不得作为 GitHub Release 公共平台 manifest。

#### Scenario: 当前只冻结 npm artifact identity
- **WHEN** release workflow 生成 candidate metadata
- **THEN** metadata MUST 只描述 npm filename、size、SHA-256/SHA-512、payload 与 commit
- **AND** MUST NOT生成平台 checksums 或 public release manifest

### Requirement: GitHub Release Assets 必须使用不可覆盖 ensure 与公共 readback
**Reason**: 当前 GitHub Release 不承载 Buildr binary Assets。

**Migration**: npm Registry version/integrity ensure 与安装后 readback 成为唯一公开 bytes 恢复契约。

#### Scenario: 当前只执行 Registry ensure
- **WHEN** release workflow 恢复或公开回读
- **THEN** workflow MUST 只核对 npm Registry package/version/integrity
- **AND** MUST NOT创建、上传、覆盖或下载 GitHub Release binary Assets
