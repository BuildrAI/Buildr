## ADDED Requirements

### Requirement: 应用负载 manifest 必须使用稳定公共 JSON identity
Buildr application payload manifest MUST 使用 `buildr.application-payload/v1`，并 MUST 以 closed 字段表达 Buildr version、protocol identity、source commit、sorted files 与 `applicationPayloadDigest`。Manifest MUST NOT 包含 channel-specific Node/installer、secret、本机绝对路径、checkout path 或临时 CI URL。

#### Scenario: npm 与平台读取 payload manifest
- **WHEN** npm pack staging 或平台 native job 消费冻结 payload
- **THEN** 两者 MUST 解析同一 schema major 和逐字节相同 manifest
- **AND** schema registry/verification MUST 拒绝未知 required field、file digest 漂移或不同 `applicationPayloadDigest`

### Requirement: release manifest 必须使用稳定公共 JSON identity
GitHub Release 的 `buildr-v<version>-release-manifest.json` MUST 使用 `buildr.release-manifest/v1`。Payload MUST 绑定 tag、source commit、Buildr/protocol identity、application payload digest、npm artifact 与 platform artifact array；每项平台 artifact MUST 包含 filename、platform、architecture、Product Node version、final SHA-256、size、签名状态和压缩前/安装后 size。

#### Scenario: 解析正式 release manifest
- **WHEN** installer、README/安装脚本或 public readback verifier 读取 manifest
- **THEN** closed platform/architecture/channel/signing enum 与 required identity MUST 可确定性解析
- **AND** consumer MUST 只下载 manifest 中目标 platform/architecture 的不可变 GitHub Release asset

#### Scenario: 尚未验证的平台
- **WHEN** `windows-arm64` 或其他 target 尚未正式声明和验证
- **THEN** manifest MUST 不包含该 artifact entry
- **AND** schema MUST NOT 使用空 digest、placeholder 或 `supported: true` 暗示可下载

### Requirement: 安装来源与多渠道状态必须使用稳定公共 JSON identity
`buildr update check --json`、平台/Launcher status 与 Doctor full detail 中的 installation inventory MUST 使用登记的 additive schema，并 MUST 以 closed `npm|platform|development|unknown` channel 和 `host|product|workspace|development|unknown` runtime role 表达来源。每项 MUST 包含可用的 Buildr、path/source root、runtime、protocol、payload 与 ownership identity；unknown MUST 保留缺失原因。

#### Scenario: Agent 读取多渠道状态
- **WHEN** Agent 查询同时存在的 npm、platform、development 与 current instance
- **THEN** JSON MUST 将它们作为独立对象并提供稳定 channel/runtime role enum
- **AND** MUST NOT 暴露 signing private material、SQLite/database path、Workspace secrets 或以 PATH 推断的虚假 ownership

#### Scenario: schema coverage
- **WHEN** 新 payload/release/installation JSON surface 未登记，或 checkout/npm/platform 对共享 identity 使用不同字段类型
- **THEN** public JSON coverage MUST 失败并报告 family/action 差异
- **AND** 兼容扩展 MUST 遵循现有 schema major 演进规则

