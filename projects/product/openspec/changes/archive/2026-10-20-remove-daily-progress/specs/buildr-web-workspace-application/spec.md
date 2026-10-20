## REMOVED Requirements

### Requirement: 本机 HTTP 必须提供只读每日演进 API
Buildr Web Runtime MUST 提供 Project-scoped 与 Task-scoped 只读每日演进 API，在解析已登记 Workspace 后读取 `.buildr/daily-progress/` 中已保存 YAML，并解析本机 Task Record 摘要。API MUST 复用既有同源、session 与未知字段拒绝边界，MUST NOT 接受文件系统路径、MUST NOT 写入或删除演进文件，MUST NOT 创建 Task，也 MUST NOT 在 GET 时扫描 Git 或读取 `git config user.email`。

#### Scenario: 读取某 Project 某日演进
- **WHEN** 已认证请求读取已登记 Project 的存在日期
- **THEN** HTTP interface MUST 调用 Daily Progress Application inspect
- **AND** 响应 MUST 包含日摘要、提交、变更文件与可导航 Task 摘要

#### Scenario: 按 Task 反查
- **WHEN** 已认证请求读取某 Task 关联的每日演进
- **THEN** API MUST 只返回本机文件中引用该 Task ID 的提交或摘要条目
- **AND** MUST NOT 扫描 Git 或合成不存在的日期文件

**Reason:** 用户确认每日演进功能无实际用处，明确删除；未来需求将重新设计。

**Migration:** 相关命令、API、界面入口与 Skill 一并移除；`.buildr/daily-progress/` 既有本机文件保留在用户机器上但不再被产品读写。

## MODIFIED Requirements

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
- **THEN** App Shell MUST 在顶栏依次展示“工作台”“工作空间”，概览和任务位于工作台导航，项目、服务、代码库、技能和文章位于工作空间导航；设置 MUST 位于顶部工作空间选择菜单及工作空间卡片
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
