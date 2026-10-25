## MODIFIED Requirements

### Requirement: npm release artifact manifest 必须使用稳定公共 JSON identity
npm release artifact manifest MUST 使用稳定 schema identity，并 MUST 表达 package/version、filename、size、SHA-256、SHA-512 integrity、payload digest、protocol、source commit、Host Node engines 与 inventory。当前 MUST NOT 生成或登记 platform release manifest/checksums schema。

#### Scenario: 验证 npm release artifact
- **WHEN** workflow 在 端到端检查（E2E）、publish 或 Registry readback 前读取 release artifact manifest
- **THEN** reader MUST 逐字节核对唯一 tarball 的 filename、size、SHA-256、integrity 与 payload digest
- **AND** manifest 出现 platform target、Product Node、installer 或签名字段时 MUST 失败
