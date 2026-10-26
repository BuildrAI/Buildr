## MODIFIED Requirements

### Requirement: 本机应用必须以控制台级信息层级呈现资源
Buildr 本机应用 MUST 使用紧凑的工作控制台信息层级：中文为主语言、技术身份与 Git observation 为次级信息、稳定 metadata 编辑与资源目录分离，对象登记使用明确表单，代码准备等执行动作仍通过智能体（Agent）进行。

#### Scenario: 查看资源列表
- **WHEN** 用户打开项目、服务、代码库或技能目录
- **THEN** 页面 MUST 提供一致的标题、数量、过滤、刷新控件与“新增 xxx”主操作；技能受管内容仍通过智能体动作维护
- **AND** 表格操作 MUST 使用一致的低强调详情链接或按钮，资源行本身不得同时承担主编辑流程

#### Scenario: 查看资源详情
- **WHEN** 用户打开 Project、Service 或 Change 详情
- **THEN** 页面 MUST 按页头、概览、稳定 metadata、技术信息和关联资源的层级展示真实 read model
- **AND** UUID、revision、路径、source 和 Git observation MUST 不占用主标题或主概览视觉

#### Scenario: 反映真实导航层级
- **WHEN** 用户在工作空间内浏览目录或详情
- **THEN** 应用壳（App Shell）MUST 在顶栏显示可理解的工作空间名称，在一级图标列联动当前悬停或固定展开的导航组，并在其二级导航中标记对应资源
- **AND** 工作空间切换器 MUST 展示当前名称，并提供返回工作空间目录的明确入口

### Requirement: 资源详情与修改必须使用独立操作
Buildr 本机应用 MUST 将 Project 与 Service 的详情呈现保持为只读，并以统一的标签和值展示资源身份、稳定 metadata 与来源事实；技术信息 MUST 在折叠区内沿用相同的标签和值形式。Project 与 Service 常用编辑入口 MUST 使用右侧抽屉，且 MUST NOT 改变当前页面 URL；既有独立编辑 URL MUST 保持兼容。Project 与 Service 详情 MUST NOT 内嵌所属关联资源的目录、卡片或跳转入口。Project 列表行 MUST 只展示标题与说明；Service 关联资源跳转 MUST 由服务目录行的操作列提供。

#### Scenario: 查看只读资源详情
- **WHEN** 用户打开 Project 或 Service 详情
- **THEN** 页面 MUST 展示资源身份、说明、稳定 metadata 与技术信息
- **AND** 主事实与展开的技术信息 MUST 使用统一的标签和值形式
- **AND** 页面 MUST NOT 直接展示可编辑 input、textarea、保存按钮或关联资源跳转入口

#### Scenario: 从资源目录开始修改
- **WHEN** 用户在 Service 目录中选择“编辑”操作
- **THEN** 页面 MUST 在当前目录打开对应资源的右侧编辑抽屉
- **AND** 编辑页面 MUST 保持现有 metadata 白名单、revision CAS、迁移只读与反馈语义

#### Scenario: 从项目详情开始修改
- **WHEN** 用户打开项目详情
- **THEN** 详情右上角 MUST 提供“编辑项目”操作
- **AND** 该操作 MUST 打开右侧编辑抽屉且不离开当前详情 URL
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
- **THEN** 二级导航中的资源项 MUST 显示明显的当前状态，一级区域图标 MUST 仅联动当前悬停或固定导航组，不随浏览路由改变
- **AND** 其他导航项的样式 MUST NOT 取代当前资源项的高亮

#### Scenario: 编辑抽屉保存与关闭
- **WHEN** 用户编辑项目或服务
- **THEN** 抽屉 MUST 明确显示对象名称并在底部固定保存和取消操作
- **AND** 保存成功 MUST 关闭抽屉并原位更新当前页面，不重置阅读位置
- **AND** 保存失败 MUST 保持抽屉和当前输入，沿用原有并发冲突保护

#### Scenario: 保护未保存内容
- **WHEN** 有未保存修改时用户点击取消、关闭、遮罩或按 Escape
- **THEN** MUST 直接关闭抽屉，不再显示放弃修改二次确认，未保存内容不得写入数据
- **AND** 保存中 MUST 阻止重复提交和关闭
- **AND** 无修改时 MUST 可直接关闭

#### Scenario: 手机编辑
- **WHEN** viewport 宽度为390px
- **THEN** 编辑抽屉 MUST 使用屏幕全宽，表单可滚动且底部操作仍可达

### Requirement: 全局应用必须提供 Workspace 级应用外壳与路由
Buildr MUST 提供解释 Workspace 心智的全局 Workspace 页面，并 MUST 在选定 Workspace 下提供任务列表、设置、Project、Service 和 Change 等既有稳定路由；应用外壳 MUST 将工作台、工作空间和代码作为原工作区左侧竖向一级图标入口，并将资源入口放入对应区域可悬停查看或固定展开的二级导航，设置入口归属顶部工作空间选择菜单，进入 Workspace 后 MUST 直接打开工作概览，且 MUST NOT 再提供独立的 Workspace 开始/详情页作为默认落地页。

#### Scenario: 打开全局首页
- **WHEN** 用户打开根路由
- **THEN** 页面 MUST 展示全部已登记 Workspace 的真实身份和可用状态
- **AND** MUST 用普通语言说明 Workspace 是用户与 Agent 共同工作的顶层目录
- **AND** MUST 提供登记已有 Workspace、让 Agent 创建 Workspace、移除登记和进入 Workspace 的明确操作
- **AND** MUST 说明登记只保存本机入口，不移动或修改 Workspace 源资产

#### Scenario: 进入 Workspace
- **WHEN** 用户选择一个可用 Workspace
- **THEN** 页面 MUST 导航到 `/workspaces/:workspaceId/overview`
- **AND** Workspace 内导航 MUST 保持该 `workspaceId` 上下文

#### Scenario: 展示核心导航层级
- **WHEN** 用户在选定 Workspace 中浏览
- **THEN** 应用壳（App Shell）MUST 在原工作区左侧一级图标列依次展示“工作台”“工作空间”“代码”，概览和任务位于工作台二级导航，项目、服务、代码库、技能和文章位于工作空间二级导航，代码保持其原有二级入口；设置 MUST 位于顶部工作空间选择菜单及工作空间卡片
- **AND** MUST NOT 将“开始”作为常驻主导航项
- **AND** 用户 MUST 能通过品牌标识或工作空间切换到达当前 Workspace 的工作概览
- **AND** `/workspaces/:workspaceId/` MUST 到达工作概览，`/workspaces/:workspaceId/overview` MUST 展示工作概览
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

#### Scenario: 切换工作空间不改变已有对话归属
- **WHEN** 用户保留内部对话并切换浏览另一个工作空间（Workspace）
- **THEN** 工作页面 MUST 使用新选择的工作空间（Workspace）身份，已有对话 MUST 保留自己的工作空间（Workspace）与起始目录（CWD）
- **AND** 全局对话入口 MUST 保持可达，MUST NOT 将页面切换自动变成执行指令或修改任一工作空间（Workspace）源资产
