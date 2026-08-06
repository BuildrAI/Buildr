## ADDED Requirements

### Requirement: Task 概览必须以关联 Change Brief 为主要说明
Local App MUST 仅在 Task 详情概览中，从该 Task Record 已保存的 Change 引用读取关联 Change，并 MUST 将每个可用的 Change Brief 作为主要人类可读说明。Task title、intent、范围和其他 Task 专业事实 MUST 保持可读，但 MUST NOT 取代 Brief 成为关联 Change 的主要说明。

#### Scenario: 查看含 Brief 的关联 Change
- **WHEN** 用户打开一个含有可解析 Change 引用且该 Change 提供 Brief 的 Task 概览
- **THEN** 页面 MUST 在概览中展示该 Brief 的原始人类可读内容和 Change identity
- **AND** 页面 MUST 提供从当前 Task 进入该 Change 技术 artifacts 的 Task-scoped 链接

#### Scenario: 一个 Task 关联多个 Change
- **WHEN** Task Record 保存多个 Change 引用
- **THEN** 页面 MUST 按每个已保存引用分别展示可用 Brief 或其不可用状态
- **AND** 页面 MUST NOT 推断、标记或合并任一“主 Change”

#### Scenario: Brief 或关联 Change 不可用
- **WHEN** 已保存的 Change 引用无法解析，或可解析 Change 没有 Brief
- **THEN** 页面 MUST 展示该引用的真实 unavailable 状态
- **AND** Task 的 title、intent 和其他可用事实 MUST 继续可读
- **AND** 页面 MUST NOT 生成、保存、推断或从全局目录查找 Brief

#### Scenario: Task 没有关联 Change
- **WHEN** Task Record 没有 Change 引用
- **THEN** 页面 MUST 显示明确的无关联 Change 状态
- **AND** 页面 MUST NOT 扫描 Workspace、Project 或 Task Environment 以发现 Change

### Requirement: Local App 必须将 Change 限定为 Task-scoped 只读内容
Local App MUST 只通过当前 Task 的已保存 Change 引用读取 Change 内容。HTTP/Web MUST NOT 提供 Local App 的 Change 创建、修改、关联、移除、继续、审查、同步或归档操作；这些 Change 动作 MUST 保持为 Agent 在 Task 过程中使用相应 authority 推进的工作。

#### Scenario: 查看关联 Change 的完整 artifacts
- **WHEN** 用户从 Task 概览打开关联 Change
- **THEN** 页面 MUST 只通过 `/tasks/<task-id>/changes/<project>/<change>` 的 Task-scoped read model 展示 Brief、proposal、design、specs 和 tasks
- **AND** 页面 MUST 验证该 Change 引用属于当前 Task

#### Scenario: Local App 尝试通过 Change 修改 Task
- **WHEN** 浏览器请求包含 `addChanges`、`removeChanges` 或 Change-specific prompt 的 Local App 路由
- **THEN** HTTP interface MUST 在 Application mutation 前拒绝该请求
- **AND** Task Record 与 OpenSpec artifacts MUST 保持不变

#### Scenario: 未关联真实 Task 的 Change
- **WHEN** Workspace 中存在没有真实 Task Record 引用的 Change
- **THEN** Local App MUST NOT 在本次能力中列出、扫描、关联或处置该 Change
- **AND** Local App MUST NOT 将其显示为待处理 Task 或空态计数

## MODIFIED Requirements

### Requirement: 资源详情与修改必须使用独立操作
Buildr 本机应用 MUST 将 Project 与 Service 的详情呈现保持为只读，并以统一的标签和值展示资源身份、稳定 metadata 与来源事实；技术信息 MUST 在折叠区内沿用相同的标签和值形式。修改稳定 metadata MUST 通过明确、独立的编辑操作和 URL 进入。Project 与 Service 详情 MUST NOT 内嵌所属关联资源的目录、卡片或跳转入口；关联资源跳转 MUST 由相应资源目录行的操作列提供。

#### Scenario: 查看只读资源详情
- **WHEN** 用户打开 Project 或 Service 详情
- **THEN** 页面 MUST 展示资源身份、说明、稳定 metadata 与技术信息
- **AND** 主事实与展开的技术信息 MUST 使用统一的标签和值形式
- **AND** 页面 MUST NOT 直接展示可编辑 input、textarea、保存按钮或关联资源跳转入口

#### Scenario: 从资源目录开始修改
- **WHEN** 用户在 Project 或 Service 目录中选择“编辑”操作
- **THEN** 页面 MUST 导航到对应资源的独立编辑 URL
- **AND** 编辑页面 MUST 保持现有 metadata 白名单、revision CAS、迁移只读与反馈语义

#### Scenario: 从资源目录访问关联资源
- **WHEN** 用户查看任一 Project 行
- **THEN** 操作列 MUST 仅提供该项目的服务目录入口
- **WHEN** 用户查看任一 Service 行
- **THEN** 操作列 MUST 提供所属 Project 详情入口
- **AND** Project 与 Service 详情 MUST NOT 重复提供这些关联资源跳转

#### Scenario: 侧边栏指示当前资源
- **WHEN** 用户打开项目、服务目录或其详情/编辑页
- **THEN** 相应侧边栏资源项 MUST 显示明显的当前状态
- **AND** 资源分组状态 MUST NOT 取代当前资源项的高亮

### Requirement: Local App Task 视图必须只消费 Workspace structured Task read model
Buildr Local App MUST继续通过 Task Record Application 列出、查看和维护 Workspace Task，并 MUST将 SQLite repository 保持为 interface 后的本地 infrastructure。页面和 HTTP interface MUST NOT读取旧 `task.yml`、打开数据库、执行 SQL、解释 migration ledger 或暴露 database path/table/row id。Local App 的 Task mutation MUST NOT 添加、移除或以其他方式维护 Change 引用。

#### Scenario: 浏览 SQLite-backed Task 列表
- **WHEN** 用户进入已登记 Workspace 的 Task 列表
- **THEN** API MUST通过 Task Application 返回 SQLite authority 中真实 Task 的排序 read model
- **AND** 页面 MUST NOT扫描 `.buildr/tasks/`、合并旧 YAML 或按 Task 专业目录推断缺失记录

#### Scenario: 数据库尚未初始化
- **WHEN** 已登记 Workspace 尚无 structured store 且用户打开 Task 列表
- **THEN** API MUST返回成功的空 Task 集合
- **AND** GET 请求 MUST NOT创建数据库、目录或 migration ledger

#### Scenario: 数据库不可用
- **WHEN** Task Application 返回 schema drift、version newer、busy、corruption 或 integrity diagnostic
- **THEN** Local App MUST显示稳定、可操作的 Workspace Task unavailable 状态
- **AND** MUST NOT静默显示空列表、自动重建数据库、回退旧 YAML 或把 SQL/本机 path 暴露给浏览器

#### Scenario: Local App 修改 Task
- **WHEN** 用户通过受保护的 Task API 创建、更新、完成或放弃 Task
- **THEN** HTTP interface MUST只提交明确 action input 和适用的 `expectedRecordDigest` 给 Task Application
- **AND** Local App update input MUST NOT 接受 `addChanges` 或 `removeChanges`
- **AND** HTTP interface MUST NOT接受 SQL、database path、table、row id、migration version 或完整 next-state document

## REMOVED Requirements

### Requirement: 本机应用必须提供 Change 管理视图
**Reason**: Change 不再是 Local App 的独立用户资源；Task 是工作入口，Change 仅作为其关联的只读内容。
**Migration**: 从关联 Task 的概览和 Task-scoped Change 链接查看已有 Change；创建和推进 Change 交给 Agent。

### Requirement: 本机应用必须提供可链接的 Change 详情页
**Reason**: 全局 Change 详情页与 Task-scoped 工作上下文并行，不能表达 Change 必须归入 Task 的边界。
**Migration**: 使用 `/tasks/<task-id>/changes/<project>/<change>` 读取已关联 Change 的 Brief 和 artifacts。

### Requirement: 项目详情必须展示所属 Change 摘要
**Reason**: Project 不再是 Change 的 Local App 浏览入口，避免重新引入未关联 Change 的目录语义。
**Migration**: 从关联 Task 查看 Change；本次不处理未关联真实 Task 的 Change。
