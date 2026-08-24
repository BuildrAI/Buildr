## ADDED Requirements

### Requirement: 公共 JSON identity 与 envelope 必须有唯一技术 owner
Buildr MUST 将当前公共 JSON schema identity registry 与 envelope helper 归入 Infrastructure Contracts 的唯一生产 owner；所有现有调用者 MUST复用该 owner，且本次结构迁移 MUST NOT改变任何已登记 identity、payload 字段、stdout/stderr 或退出行为。

#### Scenario: 模块生成既有公开 JSON
- **WHEN** 任一 CLI、Task、Workspace、System、Verification 或 Agent Assets 模块生成已有 public JSON family
- **THEN** 模块 MUST从 Infrastructure Contracts 取得相同 schema identity 与 envelope helper
- **AND** 输出 MUST与迁移前的 schemaVersion、payload 和退出语义等价

#### Scenario: 检查旧全局 Application helper
- **WHEN** 架构验证扫描 Buildr Service 生产源码
- **THEN** `src/application/json-contracts.mjs` MUST不存在
- **AND** 生产代码与验证清单 MUST不再引用该旧路径

#### Scenario: 后续 contract system 保持排除
- **WHEN** 本 Change 完成
- **THEN** Buildr MUST NOT因本次迁移引入完整 JSON Schema、Ajv、DTO 自动生成或 typed client
