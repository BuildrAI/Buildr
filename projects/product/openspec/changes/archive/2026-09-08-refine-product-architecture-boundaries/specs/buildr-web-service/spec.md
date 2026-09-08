## MODIFIED Requirements

### Requirement: Workspace前端必须按独立领域Feature组织
Buildr Web MUST让Workspace、Project、Service分别拥有独立前端Feature。每个Feature MUST拥有本领域路由页面、页面局部组件和确有复杂状态的Hook；公共`pages/`与`components/` MUST NOT继续保存这些领域的第二份页面或局部组件。Workspace、Project、Service客户端 MUST归属各自Feature且每个业务请求只保留一个实现；`src/api/` MUST只提供共享传输、会话与请求上下文。

#### Scenario: 路由装配三个领域页面
- **WHEN**`App.tsx`装配Workspace、Project和Service路由
- **THEN**每个页面入口 MUST来自对应领域Feature
- **AND**公开路由路径、稳定DOM钩子与可见行为 MUST保持不变

#### Scenario: 判断是否抽取Hook
- **WHEN**页面包含多阶段请求、导航历史或多个相互约束的状态
- **THEN**实现 MUST在页面内方法、页面内Hook、独立领域Hook或真实共享Hook之间按阅读成本和复用范围选择，不要求每个Hook独立文件
- **AND**职责和体量可维护的小页面 MUST NOT仅为目录对称建立空Hook或统一CRUD抽象

#### Scenario: Project与Service浏览Markdown文档
- **WHEN**Project和Service详情维护相同的文档加载、路径、历史、返回与错误状态
- **THEN**两个领域 MUST共享同一Markdown文档导航Hook
- **AND**领域请求URL、Tab、缺失文案、事实展示和DOM身份 MUST继续由所属页面拥有

#### Scenario: Project Daily Progress组合
- **WHEN**Project详情展示每日演进
- **THEN**Daily Progress MUST保持独立Feature并由Project详情组合
- **AND**MUST NOT并入Project CRUD Hook或提升为无领域语义的通用组件
### Requirement: Buildr Web 剩余页面必须按完整功能归位
Buildr Web MUST将 Publication 页面与能力级 client 归入 `features/publication`，将工作空间 Settings 归入 `features/workspace`、Release Awareness 归入 `features/installation`，将 Task-scoped Change 页面归入 `features/task`。`src/pages` MUST不再长期保存已有明确功能 owner 的页面；App 壳 MUST只拥有路由、布局、导航、Workspace 上下文与跨页抽屉装配。

#### Scenario: 扫描前端路由与依赖
- **WHEN** 前端架构验证扫描 `App.tsx`、`app`、`features`、`api` 与 `pages`
- **THEN** 每个业务页面 MUST从所属 feature 导入
- **AND** 通用 `api` MUST只保留 transport/session/workspace state 或尚无 feature owner 的公共边界
- **AND** 页面路由、URL、文案语义与稳定 DOM `id`/`data-*` MUST保持兼容

#### Scenario: 壳层显示版本提醒
- **WHEN** Release Awareness 返回可提示更新
- **THEN** Installation feature MUST拥有数据读取、命令文案和交互组件
- **AND** App 壳 MUST只装配该组件，不得取得 update writer 或第二份安装状态

