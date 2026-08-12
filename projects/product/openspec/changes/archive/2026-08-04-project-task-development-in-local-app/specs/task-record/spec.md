## ADDED Requirements

### Requirement: Local App Task 详情必须使用四个一级信息视图
Buildr Local App MUST 将 Task 详情一级导航收敛为“概览、研发、证据、环境”。“概览”MUST 只承载 Task Record；“研发”MUST 只读投影 Task Development；“证据”MUST 组合 Task Review 与 Task Verification 两个独立 reader；“环境”MUST 继续只读投影 Task Environment。页面 MUST NOT 为组合展示建立聚合 store、第二 writer 或新的 Task lifecycle state。

#### Scenario: 打开 Task 详情
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks/:taskId`
- **THEN** 页面 MUST 只提供“概览、研发、证据、环境”四个一级页签，并默认打开“概览”
- **AND** MUST NOT 同时保留独立一级“审查”或“验证”页签

#### Scenario: 查看研发依据
- **WHEN** 用户从“研发”中的 Planning、Verification 或 Completion gate 查找依据
- **THEN** 页面 MUST 在“证据”视图展示对应审查结果或验证结果
- **AND** 研发视图 MUST 只展示最小 gate reference 与当前结论，不得复制完整 Result

#### Scenario: 证据 reader 部分不可用
- **WHEN** Task Review 或 Task Verification 任一读取失败或缺失
- **THEN** “证据”视图 MUST 独立展示对应诊断或空状态，并保留另一 reader 的有效内容
- **AND** 概览、研发与环境视图 MUST 不受影响

### Requirement: Local App Task 证据视图必须组合独立 Task Review 投影
Buildr Local App MUST 在 Task 详情“证据”视图中提供“审查结果（Review Results）”区块，通过 Task Review Application 展示 Planning 与 Completion 两个 current 槽位；Task Record 概览、closed schema、writer 与顶层状态 MUST 保持不变，MUST NOT 保存 Review path、digest、type、conclusion 或 applicability。

#### Scenario: 打开 Task 证据视图
- **WHEN** 用户在已登记 Workspace 的 Task 详情选择“证据”
- **THEN** 审查结果区块 MUST 展示两个固定槽位的 missing/present、target identity、method、completedAt、conclusion、reviewed、uncovered、findings 与 Application 返回的 applicability
- **AND** 页面 MUST 明确区分“slot 有结果”与“结果仍适用”

#### Scenario: current target 尚不可用
- **WHEN** Task Development 尚未提供 current plan/Candidate identity，或 API 没有获得同类型 current target
- **THEN** 已存在 Result MUST 显示 `unknown` 而不是 current
- **AND** Completion 缺少 Candidate 时 MUST 不显示伪 Candidate 或通过状态

#### Scenario: Task Record mutation
- **WHEN** 用户编辑、完成或放弃 Task Record
- **THEN** Task Record Application MUST 不读取、复制、删除或改写 `reviews/` 下任一文件

## MODIFIED Requirements

### Requirement: Local App Task Review API 必须复用 Application 并保持只读
Buildr MUST 提供 Workspace-scoped `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/reviews`，在解析已登记 Workspace 与真实 Task 后调用 Task Review Application `inspect`。HTTP/Web 层 MUST NOT 接收 target/root/path、直接读取 Result 文件、计算 digest、派生 applicability 或提供 Result CRUD。

#### Scenario: 安全读取 Task Review
- **WHEN** 请求命中已登记 Workspace 和存在的 Task
- **THEN** API MUST 返回 Task Review operation read model，并使用 no-store 语义

#### Scenario: 越界或未知字段
- **WHEN** 请求包含 query 参数、filesystem path、target/root 或未知 Task
- **THEN** API MUST fail closed，MUST 不读取或创建任何 Review 文件

#### Scenario: 人从 Local App 发起 Review
- **WHEN** 用户在“证据”视图的审查结果区块点击发起或重新审查
- **THEN** Local App MUST 只生成带 Task ID 与 reviewType 的 Agent action
- **AND** MUST 不在浏览器或 HTTP handler 中直接提交、编辑或删除 Result

## REMOVED Requirements

### Requirement: Local App Task 详情必须组合独立 Task Review 投影
**Reason**: 原要求把 Review 固定为独立一级“审查”页签，已与本 Change 收敛后的“证据”组合视图冲突。
**Migration**: 使用“Local App Task 证据视图必须组合独立 Task Review 投影”；Review Application、两个 current 槽位和只读 authority 保持不变。
