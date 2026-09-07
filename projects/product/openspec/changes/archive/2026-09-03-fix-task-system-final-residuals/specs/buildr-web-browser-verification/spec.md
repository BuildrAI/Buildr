## ADDED Requirements

### Requirement: Task Browser Smoke 必须覆盖目录默认值与读取竞态
Task Browser Smoke MUST通过生产托管 `web-dist` 验证首次进入只显示 open Tasks、复盘筛选可查看 terminal Tasks、较旧响应不能覆盖较新筛选、空 Workspace 与筛选无结果保持不同文案，以及详情 Task ID hook 唯一。

#### Scenario: 默认目录与复盘筛选
- **WHEN** fixture 同时包含 open、completed、abandoned 和带复盘状态的 Task
- **THEN** 首次列表 MUST只显示 open Task
- **AND** 选择复盘状态后 MUST显示匹配 terminal Task

#### Scenario: 延迟旧请求
- **WHEN** Browser 使旧 list 请求晚于新筛选请求完成
- **THEN** 页面 MUST保持新筛选的数据、计数与空态
- **AND** 旧请求结果 MUST被丢弃

#### Scenario: 两种空状态
- **WHEN** 空 Workspace 首次打开，或非空 Workspace 的当前筛选无结果
- **THEN** 页面 MUST分别显示“还没有正式任务记录”和“当前筛选没有匹配任务”

#### Scenario: 详情 DOM ID
- **WHEN** 任意 Task 详情加载完成
- **THEN** Browser MUST断言 `#task-detail-id` 数量为一且内容匹配 URL Task

## REMOVED Requirements

### Requirement: Task Browser Smoke 必须区分 active currentness 与 terminal delivery
**Reason**: 该矩阵依赖已退役 Environment、Development Handoff、旧 Finish 和机器 delivered 投影。

**Migration**: Browser 直接验证四态 Task Record、独立 Review/Verification、父任务协调、复盘文档和当前资源 owner。

#### Scenario: 当前任务页面
- **WHEN** Browser 打开 todo、active、completed 或 abandoned Task
- **THEN** MUST展示 Task Record 保存的真实状态与结果
- **AND** MUST不派生 delivered/unproven 或读取退役专业记录

### Requirement: Browser verification 的公开结果必须命名为 Buildr Web
**Reason**: 该旧 Requirement 的唯一 Scenario 仍把 Execution Record 当作公开读取入口；产品名称要求已由当前 Buildr Web 规范覆盖。

**Migration**: Browser smoke、selector、registry与诊断继续使用Buildr Web名称；不再通过Execution Record读取。

#### Scenario: 读取 Browser verification 结果
- **WHEN** 用户或 Agent 查看当前 Browser verification 输出
- **THEN** 可见能力名称 MUST为 Buildr Web Browser Smoke
- **AND** MUST不依赖 Task Execution Record
