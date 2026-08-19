## ADDED Requirements

### Requirement: Buildr Web 壳层必须采用上下结构
Buildr Web App Shell MUST 使用顶栏承载品牌、主导航、工作空间切换、设置与（进入 Workspace 后的）交给 Agent，并将页面内容放在顶栏下方。壳层 MUST NOT 使用常驻左侧栏作为主导航。服务与文章的列表与详情 MUST 在同一顶栏下整页切换。任务页与项目页在宽屏 MUST 并排展示左侧列表与右侧详情（或空态），且 MUST 保持既有 `/tasks`、`/tasks/:taskId`、`/projects` 与 `/projects/:projectCode` 路由。项目详情右上角 MUST 提供编辑入口。视觉 token、Ant Design 5 与离线 CSP 边界 MUST 保持既有重设计约束。

#### Scenario: 顶栏承载主导航
- **WHEN** 用户在选定 Workspace 中打开 Buildr Web
- **THEN** 顶栏 MUST 展示任务、项目、服务、文章导航
- **AND** 工作空间切换器与设置 MUST 位于顶栏
- **AND** 页面主体 MUST 通栏展示当前路由内容

#### Scenario: 进入 Workspace 直接打开任务列表
- **WHEN** 用户查看顶栏主导航
- **THEN** MUST NOT 出现常驻“开始”导航项
- **AND** 进入可用 Workspace、点击品牌或切换当前工作空间 MUST 打开该 Workspace 的任务列表
- **AND** `/workspaces/:workspaceId/` 与 `/workspaces/:workspaceId/overview` MUST 重定向到任务列表

#### Scenario: 详情保持通栏
- **WHEN** 用户从服务或文章列表进入详情
- **THEN** 详情 MUST 替换通栏内容区
- **AND** MUST NOT 在壳层内同时并排显示该资源的列表与详情

#### Scenario: 任务页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开任务列表或某条任务详情
- **THEN** 左侧 MUST 继续展示任务列表
- **AND** 右侧 MUST 展示对应详情，或在未选任务时展示空态
- **AND** `/tasks` 与 `/tasks/:taskId` 路由 MUST 保持不变

#### Scenario: 任务页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开任务详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 任务列表 MAY 暂时不与详情并排

#### Scenario: 项目页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开项目列表或某个项目详情
- **THEN** 左侧 MUST 继续展示项目列表
- **AND** 右侧 MUST 展示对应详情，或在未选项目时展示空态
- **AND** 项目详情右上角 MUST 提供“编辑项目”操作
- **AND** `/projects` 与 `/projects/:projectCode` 路由 MUST 保持不变

#### Scenario: 项目页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开项目详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 项目列表 MAY 暂时不与详情并排

#### Scenario: 列表筛选保持一行
- **WHEN** 用户打开任务列表
- **THEN** 搜索与筛选控件 MUST 出现在标题下方的同一工具行
- **AND** MUST NOT 使用独立竖排筛选表单卡作为默认布局
