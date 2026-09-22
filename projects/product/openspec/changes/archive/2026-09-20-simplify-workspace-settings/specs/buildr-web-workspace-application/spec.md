## MODIFIED Requirements

### Requirement: Workspace 设置必须承载受控 metadata 修改
Buildr MUST 将明确目标 Workspace 的 metadata 编辑放在共用设置抽屉，并继续复用现有白名单、迁移只读和 revision compare-and-swap 契约。

#### Scenario: 查看 Workspace 设置
- **WHEN** 用户通过顶部工作空间选择菜单、工作空间卡片或旧设置地址打开设置
- **THEN** 抽屉 MUST 明确目标工作空间并展示可编辑的 `name`、`description`
- **AND** MUST 只以辅助辨认的一行显示只读 root path，不展示 `id`、schema identity 和 revision；程序继续保留其身份和并发校验用途

#### Scenario: 保存 Workspace 设置
- **WHEN** 用户基于当前 revision 保存合法的 `name` 或 `description`
- **THEN** 页面 MUST 调用 Workspace Application 写入并刷新新 revision
- **AND** App Shell 中的当前 Workspace 名称 MUST 同步刷新

#### Scenario: Workspace 设置发生 revision conflict
- **WHEN** 外部 Agent、Git、编辑器或其他页面会话已改变 Workspace manifest
- **THEN** 抽屉 MUST 保留用户输入，并提供最新内容供重新判断
- **AND** MUST NOT 自动 merge 或覆盖真实文件

#### Scenario: 从其他工作空间卡片编辑
- **WHEN** 用户从目录中的某张工作空间卡片打开设置
- **THEN** 读取与保存 MUST 显式使用该卡片身份，不借用当前全局工作空间或目录清单版本
- **AND** 保存 MUST 更新该卡片，只有修改当前工作空间时才刷新其顶部名称；页面位置和浏览范围 MUST 保留

#### Scenario: 取消或异常
- **WHEN** 用户取消修改，或工作空间存在迁移要求、身份冲突、路径不可用
- **THEN** 取消 MUST 零写入；异常 MUST 只限制相关保存并给出明确诊断


### Requirement: 全局应用必须提供 Workspace 级应用外壳与路由
Buildr MUST 提供解释 Workspace 心智的全局 Workspace 页面，并 MUST 在选定 Workspace 下提供任务列表、设置、Project、Service 和 Change 等既有稳定路由；应用外壳 MUST 将工作台和工作空间作为顶栏核心路径，并将资源入口放入对应区域的左侧导航，设置入口归属顶部工作空间选择菜单，进入 Workspace 后 MUST 直接打开工作概览，且 MUST NOT 再提供独立的 Workspace 开始/详情页作为默认落地页。

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
- **THEN** App Shell MUST 在顶栏依次展示“工作台”“工作空间”，概览、任务和动态位于工作台导航，项目、服务、代码库、技能和文章位于工作空间导航；设置 MUST 位于顶部工作空间选择菜单及工作空间卡片
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
