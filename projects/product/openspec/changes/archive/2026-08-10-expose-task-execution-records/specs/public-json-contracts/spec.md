## ADDED Requirements

### Requirement: Task Execution Record 查询必须提供稳定 portable JSON
Buildr MUST 为 Task-scoped execution record list、detail 与 body-file read 登记稳定 v1 public JSON identity。List MUST 表达 requested view 与 records；detail MUST 表达单条 portable record 和可用正文文件；body-file read MUST 表达 record/file identity、完整性 metadata、内容与截断状态。三类 payload MUST 使用 closed 字段白名单，且 MUST NOT 暴露 SQLite、database row、body locator、本机路径、resource token 或 mutation action。

#### Scenario: list 与 detail JSON
- **WHEN** Local App HTTP 返回 execution record list 或 detail
- **THEN** payload MUST 分别使用已登记的 v1 schema identity
- **AND** 同一 record 在不同 view 中 MUST 保持相同 record identity 与 metadata 语义

#### Scenario: body-file JSON
- **WHEN** Local App HTTP 成功读取 execution record 正文文件
- **THEN** payload MUST 返回 UTF-8 content、digest、stored size、stored truncation、response bytes 与 response truncation
- **AND** payload MUST NOT 返回 locator 或任何可用于读取其他文件的路径

#### Scenario: 无效或不可用正文
- **WHEN** filename 不受支持、record 不属于 Task、正文已 cleaned 或完整性校验失败
- **THEN** HTTP MUST 返回统一 diagnostic envelope 与准确 status
- **AND** MUST NOT 在错误 details 中泄漏正文 locator 或绝对路径
