## ADDED Requirements

### Requirement: Task Execution Record 必须提供同 authority 的 portable 只读视图
Task Execution Record Application MUST 按 Task 提供列表与单条详情的 portable read model，并 MUST 支持 `all`、`verification`、`finish` 三种 closed view；专业 view MUST 只映射既有 owner，所有 view MUST 读取同一 `task_execution_records` authority。Read model MUST NOT 暴露 SQLite、body locator、本机绝对路径、reserved quota、effects path，也 MUST NOT复制 Verification Result、Finish current/terminal 或 execution resource facts。

#### Scenario: 查看全部记录
- **WHEN** caller 请求一个 Task 的 `all` execution record view
- **THEN** Application MUST 按稳定顺序返回该 Task 的 Verification 与 Finish records
- **AND** 每条记录 MUST 使用同一 portable identity 与安全 metadata 投影

#### Scenario: 查看专业记录
- **WHEN** caller 请求 `verification` 或 `finish` view
- **THEN** Application MUST 分别只返回 `task-verification` 或 `task-finish` owner 的 records
- **AND** MUST NOT 创建或读取第二分类 store

#### Scenario: 读取其他 Task 的 record
- **WHEN** caller 以 Task A 的 route 请求实际属于 Task B 的 record identity
- **THEN** Application MUST fail closed
- **AND** MUST NOT 返回 Task B 的 metadata 或正文信息

### Requirement: Task Execution Record 正文必须通过白名单限量读取
Task Execution Record Application MUST 只接受 Task ID、record identity 与 manifest 中存在的 closed filename 读取正文。Body Store MUST 从 record 派生 owned directory，验证目录、manifest、record identity、owner、redaction version、文件集合、digest、size 与 SQLite metadata 后，返回最多 512 KiB 的 UTF-8 preview。响应 MUST 标明文件 digest、stored size、stored truncation 与 response truncation；MUST NOT 接受 path、locator、glob、range 或任意 filename。

#### Scenario: 读取有效正文文件
- **WHEN** retained record 的 requested filename 属于正文白名单且存在于已验证 manifest
- **THEN** Application MUST 返回 integrity-verified 的限量 UTF-8 内容及 portable file metadata
- **AND** 超过响应上限时 MUST 在 UTF-8 边界截断并标记 `responseTruncated`

#### Scenario: 文件名未声明
- **WHEN** requested filename 不在 closed 白名单或不在该 record manifest
- **THEN** Application MUST 在读取任意请求路径前拒绝
- **AND** MUST NOT 回退到目录扫描、路径拼接或 locator 输入

#### Scenario: cleaned tombstone
- **WHEN** record 已 cleaned 或正文状态不是 available
- **THEN** 列表与详情 MUST 继续返回 tombstone metadata
- **AND** 正文读取 MUST 返回稳定 unavailable diagnostic，不扫描文件系统恢复内容

#### Scenario: 正文完整性不匹配
- **WHEN** manifest、entry、digest、size 或 metadata 任一校验失败
- **THEN** body read MUST fail closed 且不返回部分正文
- **AND** MUST 保留现场供 owner recovery 或 Doctor 后续诊断
