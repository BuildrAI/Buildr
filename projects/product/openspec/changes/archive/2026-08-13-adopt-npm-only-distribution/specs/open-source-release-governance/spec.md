## ADDED Requirements

### Requirement: Release workflow 必须只发布 npm package
Buildr release workflow MUST 只将唯一 `@buildr-ai/buildr` tarball 发布到 npm Registry。Workflow MUST 从 tag、package version、source commit、dist-tag 与 release notes 解析唯一 release contract，只执行一次 application payload build 和一次 `npm pack`，并让 smoke、protected publish 与 Registry integrity readback 消费同一 tarball bytes。GitHub Release MAY 承载 tag notes metadata，但 MUST NOT 上传 npm tarball、Launcher、SEA、PKG/MSI、platform manifest 或 checksums。

#### Scenario: 可逆验证先于 npm publish
- **WHEN** tag workflow 准备发布
- **THEN** npm inventory、Host Node CLI/Web、Launcher lifecycle、package identity、integrity 与 release notes checks MUST 在 `npm publish` 前全部通过
- **AND** 任一失败 MUST 阻止不可逆发布

#### Scenario: 发布并回读同一 tarball
- **WHEN** protected npm publish 获得授权
- **THEN** workflow MUST 发布已冻结 tarball，并从官方 Registry 读取精确 version/integrity 后重新安装 smoke
- **AND** MUST NOT重新 pack、切换本地 publish 或把 Actions artifact 作为公共下载地址

### Requirement: 正式 Buildr bytes 必须只由 npm Registry 承载
Buildr 当前正式产品 bytes MUST 只通过 npm Registry 的 `@buildr-ai/buildr` package 分发。官网、README 与安装说明 MUST 只指向 npm installation；本机 `.app` 或 Start Menu shortcut MUST 由用户显式运行已安装 Buildr 生成，不得作为下载资产、GitHub Release Asset 或第二份 binary 保存。

#### Scenario: 获取正式 Buildr
- **WHEN** 用户查找正式安装方式
- **THEN** 文档 MUST 提供 `npm install -g @buildr-ai/buildr` 与兼容 Node 要求
- **AND** MUST NOT 提供 `.pkg`、`.msi`、SEA 或 Actions artifact 下载链接

#### Scenario: 获取图形入口
- **WHEN** npm 用户需要图形入口
- **THEN** 文档 MUST 指引显式执行 `buildr web launcher install`
- **AND** 生成的本机投射 MUST NOT 上传到 Registry、GitHub Release、官网或另一个 binary store

### Requirement: GitHub Release metadata 必须可恢复且禁止 binary Assets
GitHub Release metadata MUST 继续与 tag、target commit、version、notes 和 prerelease/Latest 语义一致，但当前 release workflow MUST NOT 创建或 ensure 正式 binary Assets。npm Registry 的已发布 version/integrity 是唯一 product-byte recovery authority；同 version 已存在且 integrity 相同时 MUST 复用，漂移时 MUST 停止且不得覆盖。

#### Scenario: 重跑缺少 npm publish 的 tag workflow
- **WHEN** tag metadata 已存在但 npm version 尚不存在
- **THEN** workflow MUST 复用冻结 tarball并只补齐 npm publish/readback
- **AND** MUST NOT 创建平台 Assets 或重建 tarball

#### Scenario: npm version 已存在
- **WHEN** Registry 已存在相同 version
- **THEN** workflow MUST 比较 package、version 与 integrity；完全相同时复用并继续 readback，任何不一致时停止
- **AND** MUST NOT unpublish、覆盖或发布第二份 bytes

## REMOVED Requirements

### Requirement: Release workflow 必须按版本和渠道受控发布
**Reason**: 当前没有双渠道发布，workflow 只发布 npm package。
**Migration**: 使用新增的 npm-only release workflow requirement。

#### Scenario: 只发布 npm package
- **WHEN** tag workflow 获得发布授权
- **THEN** MUST 只发布冻结 npm tarball

### Requirement: 正式分发位置必须按渠道唯一
**Reason**: 当前唯一正式 byte authority 是 npm Registry。
**Migration**: 使用新增的 npm Registry-only distribution requirement。

#### Scenario: npm Registry 是唯一 byte authority
- **WHEN** 用户获取正式 Buildr bytes
- **THEN** MUST 从 npm Registry 获取

### Requirement: GitHub Release 与 Assets 必须可恢复且不可覆盖
**Reason**: GitHub Release 只保留 metadata，不再承载正式 binary Assets。
**Migration**: 使用新增的 metadata ensure 与 binary Asset prohibition requirement。

#### Scenario: GitHub Release 不承载 binary
- **WHEN** workflow ensure GitHub Release
- **THEN** MUST 只核对 metadata且不得上传 binary Asset

### Requirement: 平台升级必须绑定上一代公开发布 lineage
**Reason**: 当前没有平台 installer、平台升级或 GitHub Release binary Assets，不需要 previous-platform lineage。

**Migration**: 删除当前 release contract 中的 platform generation authority；未来恢复平台正式渠道时必须以新的 Change 重新定义首代与升级 lineage。

#### Scenario: 当前发布不解析 platform lineage
- **WHEN** workflow 解析 npm-only release contract
- **THEN** contract MUST NOT 要求 previous platform manifest、installer digest 或 generation
- **AND** MUST 继续精确绑定 npm tag、commit、version、dist-tag 与 tarball integrity
