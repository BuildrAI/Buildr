## ADDED Requirements

### Requirement: Buildr Web Task Record 必须以内聚 feature 组织
Buildr Web MUST将 Task Record 页面、页面内组件、请求 Hook、能力级 typed Client、纯逻辑与 generated DTO 组织在 `src/features/task-record`。通用 fetch、session 与 Workspace 选择 transport MUST保留在 `src/api`；Task Review、Task Verification、Parent Coordination、Change 与 UI Prototype MUST继续通过各自能力 Client 和局部状态读取，Task Record feature MUST NOT取得这些专业事实的写入 authority。

#### Scenario: 构建 Task Record 页面
- **WHEN** `TasksPage`、`TaskDetailPage` 或其页面内组件加载 Task 数据
- **THEN** 页面 MUST通过 Task Record feature 的 Hook 或 typed Client 消费 generated DTO
- **AND** MUST保持请求取消、旧 Task 响应隔离、稳定 DOM selector 与现有用户交互

#### Scenario: 专业结果读取失败
- **WHEN** Review、Verification、Parent Coordination、Change 或 UI Prototype 的读取失败
- **THEN** Task Record 与其他已成功读取的事实 MUST继续可见
- **AND** 失败 MUST保持在所属页面区域，不得升级为整个 Task 页面不可用

#### Scenario: 共享 HTTP transport
- **WHEN** Task Record typed Client 发起请求
- **THEN** 它 MUST复用 `src/api` 的 session、workspace scope 与底层 HTTP transport
- **AND** `src/api` MUST NOT反向依赖 Task Record React 页面或 Hook
