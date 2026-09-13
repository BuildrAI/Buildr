## MODIFIED Requirements

### Requirement: Buildr Web 壳层必须采用上下结构
Buildr Web App Shell MUST 在顶部提供品牌、共同工作空间范围、“工作台”和“工作空间”两个区域及交给 Agent 操作，工作台 MUST 排在工作空间之前。选定范围的两个区域 MUST 共享相同 workspaceId。工作台 MUST 沿用任务列表与详情，并保留文章入口；工作空间 MUST 使用常驻左侧导航承载项目及所属服务、服务、技能和设置。导航标签 MUST 使用中文，项目旁 MUST 提供带可访问名称“新增项目”的加号。项目详情 MUST 保留右上角编辑入口；视觉 token、Ant Design 5 与离线 CSP 边界 MUST 保持既有约束。

#### Scenario: 顶栏承载主导航
- **WHEN** 用户在选定 Workspace 中切换工作台和工作空间
- **THEN** 顶部 MUST 依次呈现“工作台”“工作空间”，保持同一工作空间范围
- **AND** 工作台 MUST 展示现有任务页面；工作空间 MUST 展示项目导航与现有内容
- **AND** 主菜单 MUST NOT 展示环境维护分组或智能体配置入口

#### Scenario: 进入 Workspace 直接打开任务列表
- **WHEN** 用户进入可用 Workspace、点击品牌或切换工作空间
- **THEN** MUST 打开该 Workspace 的任务列表并选中工作台
- **AND** `/workspaces/:workspaceId/` 与 `/workspaces/:workspaceId/overview` MUST 继续重定向到任务列表

#### Scenario: 详情保持通栏
- **WHEN** 用户从服务或文章目录进入详情
- **THEN** 详情 MUST 替换对应区域的主要内容，不重复挂载旧资源列表宿主
- **AND** 当前区域的左侧导航 MUST 保持可达

#### Scenario: 项目与服务上下文导航
- **WHEN** 用户选择某项目或打开所属服务的详情及编辑 URL
- **THEN** 左侧 MUST 默认只展开对应项目，收起其他项目，并正确标记当前对象；用户之后可以独立收起项目
- **AND** MUST 保留既有 `/projects`、`/projects/:projectCode`、`/services`、服务详情及编辑路由
- **AND** 项目详情 MUST NOT 重复并排显示旧项目列表宿主

#### Scenario: 项目新增入口
- **WHEN** 用户点击项目标题旁的加号
- **THEN** MUST 打开既有项目创建指令交互，不直接创建源资产

#### Scenario: 任务页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开任务列表或详情
- **THEN** 工作台内容区 MUST 保留任务列表与详情并排行为
- **AND** `/tasks` 与 `/tasks/:taskId` 路由 MUST 保持不变

#### Scenario: 任务页窄屏避免横向溢出
- **WHEN** viewport 宽度为 390px 且用户打开任务详情
- **THEN** 详情 MUST 可见并可操作
- **AND** 页面主容器 MUST NOT 横向溢出
- **AND** 任务列表 MAY 暂时不与详情并排

#### Scenario: 项目页宽屏并排列表与详情
- **WHEN** 用户在宽屏打开项目列表或某个项目详情
- **THEN** 工作空间左侧 MUST 展示项目导航
- **AND** 右侧 MUST 展示对应详情，或在未选项目时展示现有项目目录
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

#### Scenario: 独立展开与折叠
- **WHEN** 用户点击项目行的展开或收起按钮
- **THEN** MUST 只改变该项目子项的展示，不跳转当前页面，且最多保留一个展开项目
- **AND** 折叠操作 MUST NOT 移除当前对象的选中状态
- **AND** 按钮 MUST 支持键盘操作并提供正确的展开状态与可访问名称
- **WHEN** 用户点击项目名称或打开服务深链
- **THEN** MUST 导航到对应对象并重新展示相关项目子项

#### Scenario: 服务菜单名称
- **WHEN** 用户查看工作空间导航
- **THEN** 服务集合入口 MUST 显示“服务”，继续使用原有 `/services` 路由
- **AND** 本次 MUST NOT 改变项目和服务的身份、归属或关联语义

#### Scenario: 克制的视觉反馈
- **WHEN** 用户悬停、聚焦或展开导航
- **THEN** MUST 能辨认可操作目标与当前选择，正文阅读区域 MUST 保持清晰层级
- **AND** 减少动态效果偏好 MUST 被尊重，装饰动效 MUST NOT 延迟内容或阻止操作
