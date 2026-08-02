## ADDED Requirements

### Requirement: Local App Task 详情必须组合独立 Task Review 投影
Buildr Local App MUST 在 Task 详情中增加独立“审查”页签，通过 Task Review Application 展示 Planning 与 Completion 两个 current 槽位；Task Record 概览、closed schema、writer 与顶层状态 MUST 保持不变，MUST NOT 保存 Review path、digest、type、conclusion 或 applicability。

#### Scenario: 打开 Task Review 页签
- **WHEN** 用户在已登记 Workspace 的 Task 详情选择“审查”
- **THEN** 页面 MUST 展示两个固定槽位的 missing/present、target identity、method、completedAt、conclusion、reviewed、uncovered、findings 与 Application 返回的 applicability
- **AND** 页面 MUST 明确区分“slot 有结果”与“结果仍适用”

#### Scenario: current target 尚不可用
- **WHEN** P0.5 尚未提供 current plan/Candidate identity，或 API 没有获得同类型 current target
- **THEN** 已存在 Result MUST 显示 `unknown` 而不是 current
- **AND** Completion 缺少 Candidate 时 MUST 不显示伪 Candidate 或通过状态

#### Scenario: Task Record mutation
- **WHEN** 用户编辑、完成或放弃 Task Record
- **THEN** Task Record Application MUST 不读取、复制、删除或改写 `reviews/` 下任一文件

### Requirement: Local App Task Review API 必须复用 Application 并保持只读
Buildr MUST 提供 Workspace-scoped `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/reviews`，在解析已登记 Workspace 与真实 Task 后调用 Task Review Application `inspect`。HTTP/Web 层 MUST NOT 接收 target/root/path、直接读取 Result 文件、计算 digest、派生 applicability 或提供 Result CRUD。

#### Scenario: 安全读取 Task Review
- **WHEN** 请求命中已登记 Workspace 和存在的 Task
- **THEN** API MUST 返回 Task Review operation read model，并使用 no-store 语义

#### Scenario: 越界或未知字段
- **WHEN** 请求包含 query 参数、filesystem path、target/root 或未知 Task
- **THEN** API MUST fail closed，MUST 不读取或创建任何 Review 文件

#### Scenario: 人从 Local App 发起 Review
- **WHEN** 用户在 Review 页签点击发起或重新审查
- **THEN** Local App MUST 只生成带 Task ID 与 reviewType 的 Agent action
- **AND** MUST 不在浏览器或 HTTP handler 中直接提交、编辑或删除 Result
