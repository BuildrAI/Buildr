## MODIFIED Requirements

### Requirement: 全局应用必须提供 Workspace 级应用外壳与路由
Buildr MUST 提供解释 Workspace 心智的全局 Workspace 页面，并 MUST 在选定 Workspace 下提供任务列表、设置、Project、Service 和 Change 等既有稳定路由；应用外壳 MUST 将任务、项目、服务、文章作为顶栏核心路径，进入 Workspace 后 MUST 直接打开任务列表，且 MUST NOT 再提供独立的 Workspace 开始/详情页作为默认落地页。

#### Scenario: 打开全局首页
- **WHEN** 用户打开根路由
- **THEN** 页面 MUST 展示全部已登记 Workspace 的真实身份和可用状态
- **AND** MUST 用普通语言说明 Workspace 是用户与 Agent 共同工作的顶层目录
- **AND** MUST 提供登记已有 Workspace、让 Agent 创建 Workspace、移除登记和进入 Workspace 的明确操作
- **AND** MUST 说明登记只保存本机入口，不移动或修改 Workspace 源资产

#### Scenario: 进入 Workspace
- **WHEN** 用户选择一个可用 Workspace
- **THEN** 页面 MUST 导航到 `/workspaces/:workspaceId/tasks`
- **AND** Workspace 内导航 MUST 保持该 `workspaceId` 上下文

#### Scenario: 展示核心导航层级
- **WHEN** 用户在选定 Workspace 中浏览
- **THEN** App Shell MUST 在顶栏将“任务”“项目”“服务”“文章”展示为核心导航
- **AND** MUST NOT 将“开始”作为常驻主导航项
- **AND** 用户 MUST 能通过品牌标识或工作空间切换到达当前 Workspace 的任务列表
- **AND** `/workspaces/:workspaceId/` 与 `/workspaces/:workspaceId/overview` MUST 重定向到任务列表
- **AND** Service 视图 MUST 显示当前所属 Project，breadcrumb 或页头 MUST 表达 Workspace、Project 与 Service 层级
- **AND** Change 与未来 Rules、Skills 等能力 MUST 进入次级区域但保持既有路由可访问

#### Scenario: 保持既有深链接
- **WHEN** 用户直接访问合法的 Project、Service、Change 详情或编辑 URL
- **THEN** HTTP interface MUST 继续返回本机应用 shell并恢复同一 canonical 上下文
- **AND** 本变更 MUST NOT 因导航重组破坏既有 `/projects`、`/services?project=`、详情或编辑路由

#### Scenario: 切换 Workspace
- **WHEN** 用户从 Workspace 内选择另一个已登记 Workspace
- **THEN** 页面 MUST 切换到目标 Workspace 的 canonical route
- **AND** MUST NOT 改变任一 Workspace 源资产

#### Scenario: 恢复最近使用项
- **WHEN** 全局实例启动且最近使用的 Workspace 仍可用
- **THEN** Buildr MUST 允许启动入口直接打开该 Workspace 的任务列表
- **AND** 最近使用状态 MUST NOT 写入 Workspace 源资产

### Requirement: 本机应用必须以控制台级信息层级呈现资源
Buildr 本机应用 MUST 使用紧凑的工作控制台信息层级：中文为主语言、技术身份与 Git observation 为次级信息、稳定 metadata 编辑与资源目录分离，且所有创建动作 MUST 明示为交给 Agent 的 prompt-only 行为。

#### Scenario: 查看资源列表
- **WHEN** 用户打开 Project、Service 或 Change 目录
- **THEN** 页面 MUST 提供一致的标题、数量、过滤控件与“交给 Agent 创建”主操作
- **AND** 表格操作 MUST 使用一致的低强调详情链接或按钮，资源行本身不得同时承担主编辑流程

#### Scenario: 查看资源详情
- **WHEN** 用户打开 Project、Service 或 Change 详情
- **THEN** 页面 MUST 按页头、概览、稳定 metadata、技术信息和关联资源的层级展示真实 read model
- **AND** UUID、revision、路径、source 和 Git observation MUST 不占用主标题或主概览视觉

#### Scenario: 反映真实导航层级
- **WHEN** 用户在工作空间内浏览目录或详情
- **THEN** 应用 shell MUST 在顶栏显示可理解的工作空间名称与当前资源导航高亮
- **AND** 工作空间切换器 MUST 展示当前名称，并提供返回工作空间目录的明确入口

### Requirement: 工作空间目录与资源视图必须在窄屏保持可用
Buildr 本机应用 MUST 在桌面、约 1024px 和 390px 宽度保持可读且主要操作可用，不让页面主容器发生横向溢出。

#### Scenario: 查看工作空间目录
- **WHEN** 用户在宽屏、中屏或窄屏打开工作空间目录
- **THEN** 工作空间卡片 MUST 分别以 2–3 列、2 列和 1 列等宽网格显示
- **AND** 同一张卡内的状态、路径和操作位置 MUST 保持一致，整卡可进入工作空间，移除操作为次级行为

#### Scenario: 在窄屏查看和编辑资源
- **WHEN** viewport 宽度为 390px
- **THEN** 资源目录、详情、稳定 metadata 表单与“交给 Agent”操作 MUST 可见并可操作
- **AND** 必要的表格横向滚动 MUST 限定在表格容器内

#### Scenario: 窄屏仍能使用主导航
- **WHEN** viewport 宽度为 390px 且用户位于选定 Workspace
- **THEN** “任务”“项目”“服务”“文章”导航 MUST 仍可打开（直接显示或经明确菜单）
- **AND** MUST NOT 把主导航藏进没有入口的侧栏

### Requirement: 资源详情与修改必须使用独立操作
Buildr 本机应用 MUST 将 Project 与 Service 的详情呈现保持为只读，并以统一的标签和值展示资源身份、稳定 metadata 与来源事实；技术信息 MUST 在折叠区内沿用相同的标签和值形式。Project 编辑 MUST 从详情右上角的明确操作进入弹框，且 MUST NOT 改变当前详情 URL；Service 编辑仍可通过目录操作进入独立编辑 URL。Project 与 Service 详情 MUST NOT 内嵌所属关联资源的目录、卡片或跳转入口。Project 列表行 MUST 只展示标题与说明；Service 关联资源跳转 MUST 由服务目录行的操作列提供。

#### Scenario: 查看只读资源详情
- **WHEN** 用户打开 Project 或 Service 详情
- **THEN** 页面 MUST 展示资源身份、说明、稳定 metadata 与技术信息
- **AND** 主事实与展开的技术信息 MUST 使用统一的标签和值形式
- **AND** 页面 MUST NOT 直接展示可编辑 input、textarea、保存按钮或关联资源跳转入口

#### Scenario: 从资源目录开始修改
- **WHEN** 用户在 Service 目录中选择“编辑”操作
- **THEN** 页面 MUST 导航到对应资源的独立编辑 URL
- **AND** 编辑页面 MUST 保持现有 metadata 白名单、revision CAS、迁移只读与反馈语义

#### Scenario: 从项目详情开始修改
- **WHEN** 用户打开项目详情
- **THEN** 详情右上角 MUST 提供“编辑项目”操作
- **AND** 该操作 MUST 打开编辑弹框且不离开当前详情 URL
- **AND** 项目列表 MUST NOT 再提供编辑入口

#### Scenario: 从资源目录访问关联资源
- **WHEN** 用户查看任一 Project 行
- **THEN** 该行 MUST 只展示项目标题与说明
- **AND** 进入详情 MUST 通过选择该行完成
- **WHEN** 用户查看任一 Service 行
- **THEN** 操作列 MUST 提供所属 Project 详情入口
- **AND** Project 与 Service 详情 MUST NOT 重复提供这些关联资源跳转

#### Scenario: 侧边栏指示当前资源
- **WHEN** 用户打开项目、服务目录或其详情/编辑页
- **THEN** 相应顶栏导航项 MUST 显示明显的当前状态
- **AND** 其他导航项的样式 MUST NOT 取代当前资源项的高亮
