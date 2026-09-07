## MODIFIED Requirements

### Requirement: Buildr Web Task Record 必须以内聚 feature 组织
Buildr Web MUST将Task Record组织为`src/features/task-record/{pages,hooks,components,api}`四个平级目录。`pages` MUST只读取路由、调用Hook并组装组件；`hooks` MUST管理服务器数据、mutation、请求取消、竞态与局部失败；`components` MUST只通过props接收业务数据和回调且不得直接请求后端；`api` MUST只封装Task Record endpoint和generated DTO且不得依赖React。通用fetch/session/Workspace scope transport MUST保留在`src/api`且不得反向依赖Task feature；Review、Verification、Parent Coordination、Change、UI Prototype与Project Document MUST继续使用各自Client和独立事实边界。

#### Scenario: 构建 Task Record 页面
- **WHEN** `TasksPage`、`TaskDetailPage`或`TasksSection`加载Task功能
- **THEN** 页面 MUST通过`useTaskList`、`useTaskDetail`、`useTaskMutations`、`useTaskEvidence`或`useTaskRequestLifecycle`消费状态与动作
- **AND** 页面 MUST不直接调用`api`、`taskRecordApi`或其他后端Client
- **AND** MUST保持稳定DOM selector、现有路由与用户交互

#### Scenario: 组件展示和提交用户输入
- **WHEN** Task filter、table、overview、relations、modal、retrospective、document preview、prototype或evidence组件工作
- **THEN** 组件 MUST只消费props和回调并可以维护纯界面局部状态
- **AND** 组件 MUST不直接调用任何后端Client或取得服务器数据authority

#### Scenario: 专业结果读取失败
- **WHEN** Review、Verification、Parent Coordination、Change 或 UI Prototype 的读取失败
- **THEN** Task Record 与其他已成功读取的事实 MUST继续可见
- **AND** 失败 MUST由Hook保持在所属页面区域，不得升级为整个Task页面不可用

#### Scenario: 共享 HTTP transport
- **WHEN** Task Record Hook发起list、detail、update、complete、abandon或retrospectiveDocument请求
- **THEN** feature内`task-record-api.ts` MUST复用`src/api`提供的session、Workspace scope与底层HTTP transport
- **AND** `src/api/index.ts` MUST不导入Task Record feature
- **AND** `api`目录 MUST不依赖React、Hook、Page或Component

#### Scenario: Feature 目录保持最小层级
- **WHEN** 维护者检查Task Record前端目录
- **THEN** `logic`、`list`、`detail`、`actions`、`model`与通用`utils`子目录 MUST不存在
- **AND** 纯函数 MUST先位于真实使用的Hook或组件，只有出现多处实际复用后才建立具名文件
