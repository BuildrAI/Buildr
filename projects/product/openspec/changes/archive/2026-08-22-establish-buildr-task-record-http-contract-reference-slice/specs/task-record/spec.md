## MODIFIED Requirements

### Requirement: Buildr Web Task API 必须保持 Workspace 写安全边界
Buildr MUST 在 `/api/v1/workspaces/:workspaceId/tasks` 及 Task identity 子路径提供 Workspace-scoped read/limited-write API，并 MUST 在调用 Task Record Application 前解析已登记 Workspace 的真实 canonical root。Task collection GET MUST 只接受封闭 query schema；list、detail、update、complete、abandon MUST由 Task HTTP Interfaces 自有的 Draft 2020-12 Schema 与稳定 operation catalog 约束，并 MUST将已验证 Interface DTO 显式映射为既有 Application Query/Command。所有保留的 mutation MUST 复用现有同源、session、JSON、body size、字段白名单和未知字段拒绝边界；`target|root|path`、未知/重复 query、缺少 `expectedRecordDigest`、record conflict、terminal 与 domain error 的既有 code、status 和优先级 MUST保持等价。Task collection POST 与 activate route MUST NOT 存在。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** 请求中的 `workspaceId` 已登记、可用且与 canonical Workspace identity 一致
- **THEN** HTTP interface MUST 只把该 Workspace 的真实 root 与明确 action/filter input 交给 Application
- **AND** 结果 MUST NOT 混入其他 Workspace 的 Task 或路径

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET 使用 `q`、`project`、`service`、`status`、`hasChildren`、`hasRetrospective` 或 `retrospectiveState`
- **THEN** HTTP interface MUST 通过 list request Schema 规范化封闭 filter DTO、显式映射并调用 Task Record Application query projection
- **AND** `status` MUST 只接受 `open|todo|active|completed|abandoned|all`，其他过滤 MUST 保持其既有封闭值与组合语义

#### Scenario: Task API 提交路径或越界字段
- **WHEN** Task query/body 包含 `target`、`root`、`path`、未知 query、完整 next-state document、专业记录字段或其他未知字段
- **THEN** HTTP interface MUST 在读取或修改 Task Record 前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或任意其他 Workspace

#### Scenario: Task API 写请求不可信
- **WHEN** 保留的 mutation 缺少合法 Origin/session、不是允许的 JSON content type、超过 body limit 或 action fields 不完整
- **THEN** HTTP interface MUST 拒绝请求并保持 Task Record 不变
- **AND** MUST 返回现有 Buildr Web error envelope 可表达的稳定诊断

#### Scenario: Task API 输入校验不变异
- **WHEN** mutation body 含可转换但类型错误的值、缺失必填字段或未知字段
- **THEN** Ajv validator MUST拒绝请求且 MUST NOT转换类型、填默认值或删除字段
- **AND** Task Record Application writer MUST不被调用

#### Scenario: Task API 返回既有 result family
- **WHEN** list、detail、update、complete 或 abandon 成功，或 Application 返回 conflict、terminal/domain error
- **THEN** HTTP response MUST匹配 operation 对应的成功或错误 Schema
- **AND** Schema/DTO 引入 MUST NOT改变既有公开 payload major、Application、Domain、Persistence、SQLite 或 writer authority
