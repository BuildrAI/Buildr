## ADDED Requirements

### Requirement: Local App 必须只读投影任务研发 read model
Buildr Local App MUST 为正式 Task 提供只读“研发”视图，并 MUST 通过 Task Development Application `inspect` 展示 Development presence、当前适用性、Task context、Content Target、verification policy、Candidate/generation、Planning/Verification/Completion gates、decision、明确风险与最近一次 Development handoff。HTTP 与 Web 层 MUST NOT 直接读取或解析 `development.yml`、重新计算 identity/currentness、复制专业 Result body、提供 Receipt mutation 或注册公共 `buildr task development` CLI。

#### Scenario: 查看 current Development
- **WHEN** Task Development Application 返回 `developing`、`candidate-current` 或 `handoff-current`
- **THEN** 页面 MUST 用中文分别显示“研发中”“候选已就绪”或“研发交接已就绪”
- **AND** MUST 将 Task context、Content Target、policy、Candidate 与 handoff 的 current/stale/missing 作为独立事实展示，不得改写 Task Record status

#### Scenario: Development 尚未形成
- **WHEN** Application `inspect` 返回 `status: missing` 且没有 Development Receipt
- **THEN** 页面 MUST 显示“尚未形成研发回执”的空状态
- **AND** 概览、证据和环境视图 MUST 继续正常工作，不得创建空 Receipt 或提供浏览器写操作

#### Scenario: 当前环境不可观察但历史交接存在
- **WHEN** Application 返回已有 Receipt 且 `applicability.status` 为 `unknown`
- **THEN** 页面 MUST 保留展示已保存的候选、决定和最近一次研发交接摘要，并明确显示“历史研发交接仍被保留，但当前无法实时复核”
- **AND** 页面 MUST NOT 将历史交接标记为 current、stale 或 failed，也不得从 Environment cleanup 推断 Task 顶层状态

#### Scenario: 安全读取 Development
- **WHEN** 客户端对已登记 Workspace 和真实 Task 发起 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`
- **THEN** API MUST 返回 Task Development Application operation read model 并使用 no-store 语义
- **AND** query 参数、未知 Task、POST、PUT、PATCH 与 DELETE MUST fail closed，且 Task、Receipt、Review、Verification 与 Environment bytes MUST 保持不变

#### Scenario: 展示最小研发信息
- **WHEN** Development Receipt 包含长 identity、多个 handoff 或专业 Result reference
- **THEN** 页面 MUST 默认只展示完整但次级排版的当前 identity、候选代次、三个 gate 摘要、决定、风险数量和最近一次 handoff
- **AND** MUST NOT展示开发日志、source diff、完整命令输出、隐藏推理、完整 Result body或全部历史 handoff 列表

## REMOVED Requirements

### Requirement: 首版Development不得增加公共产品界面
**Reason**: 本 Change 明确增加只读 Local App route 与“研发”视图，旧要求把只读投影和公共写入 surface 一并禁止，已与当前产品边界冲突。
**Migration**: 使用“Local App 必须只读投影任务研发 read model”；继续禁止公共 `buildr task development` CLI、Development 写 API、浏览器 mutation 与新的 Task Core。
