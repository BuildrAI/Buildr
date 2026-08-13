## ADDED Requirements

### Requirement: npm 应用负载 manifest 必须使用稳定公共 JSON identity
Application payload manifest MUST 使用稳定 schema identity，并 MUST 表达 package/version、protocol identity、source commit、runtime/worker/resource inventory、每项 size/SHA-256 和唯一 payload digest。Manifest MUST 只描述 npm package 共享业务负载，不得包含 Product Node、SEA、installer、签名或本机 Launcher target。

#### Scenario: 验证 payload manifest
- **WHEN** npm pack 或 runtime 读取 application payload manifest
- **THEN** reader MUST 验证 closed schema、排序 inventory、逐文件摘要与总 digest
- **AND** 未知字段、绝对路径、平台 envelope 或资源漂移 MUST fail closed

### Requirement: npm release artifact manifest 必须使用稳定公共 JSON identity
npm release artifact manifest MUST 使用稳定 schema identity，并 MUST 表达 package/version、filename、size、SHA-256、SHA-512 integrity、payload digest、protocol、source commit、Host Node engines 与 inventory。当前 MUST NOT 生成或登记 platform release manifest/checksums schema。

#### Scenario: 验证 npm release artifact
- **WHEN** workflow 在 smoke、publish 或 Registry readback 前读取 release artifact manifest
- **THEN** reader MUST 逐字节核对唯一 tarball 的 filename、size、SHA-256、integrity 与 payload digest
- **AND** manifest 出现 platform target、Product Node、installer 或签名字段时 MUST 失败

### Requirement: npm installation、Launcher 与运行状态必须使用稳定公共 JSON identity
Installation origin、installation registry、Launcher binding、installation status、Doctor、CLI version 与 Web health MUST 使用 closed schema 表达 npm、development 和当前 instance identity。npm Launcher binding MUST 包含 ownership、Host Node、package entry、prefix、protocol/payload 与 target；当前 enum MUST NOT 声称 platform installation 或 Product Node 可用。

#### Scenario: npm installation 与 Launcher status
- **WHEN** Agent 请求 installation 或 launcher status JSON
- **THEN** 输出 MUST 分别展示 formal npm installation、Launcher binding、development 与当前 instance 的 closed identity、状态和 next actions
- **AND** MUST NOT包含 secret、完整环境变量、PATH 推断或不存在的 platform channel

#### Scenario: binding 漂移
- **WHEN** Host Node、entry、prefix、origin、payload 或 ownership 任一不匹配
- **THEN** JSON MUST 将 Launcher 标为 stale/invalid，列出稳定 reason code 与 repair action
- **AND** MUST NOT把可执行成功或版本相同解释为 identity current

## REMOVED Requirements

### Requirement: 应用负载 manifest 必须使用稳定公共 JSON identity
**Reason**: 当前 manifest 只描述 npm application payload，不再描述跨渠道 payload。
**Migration**: 使用新增的 npm payload manifest schema requirement。

#### Scenario: 迁移到 npm payload schema
- **WHEN** reader 读取 application payload manifest
- **THEN** MUST 接受 npm payload identity且拒绝 platform fields

### Requirement: release manifest 必须使用稳定公共 JSON identity
**Reason**: 当前 release artifact manifest 只描述唯一 npm tarball。
**Migration**: 使用新增的 npm release artifact manifest requirement。

#### Scenario: 迁移到 npm artifact schema
- **WHEN** workflow 读取 release artifact manifest
- **THEN** MUST 只描述唯一 npm tarball

### Requirement: 安装来源与多渠道状态必须使用稳定公共 JSON identity
**Reason**: 当前渠道集合不包含 platform installation，需显式表达 npm/development/Launcher/instance。
**Migration**: 使用新增的 npm installation 与 Launcher status schema requirement。

#### Scenario: 移除 platform status enum
- **WHEN** status/Doctor 输出公共 JSON
- **THEN** MUST 只表达 npm、development、Launcher 与 current instance
