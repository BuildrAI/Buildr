## MODIFIED Requirements

### Requirement: Task 顶层状态与结果必须保持单向语义
Task Record status MUST 只有 `todo`、`active`、`completed` 和 `abandoned`。`result` 在 todo 或 active 时 MUST 为 `null`，在终态时 MUST 保存简短 summary；completed result MUST 明确 `noChange: true|false`。状态只允许 `todo -> active|completed(noChange=true)|abandoned` 与 `active -> completed|abandoned`，completed 与 abandoned MUST 不可重新打开或继续修改。

#### Scenario: 激活待办 Task
- **WHEN** Agent 已完成正式 Task 创建前置分流和 Git 基线收敛，并对 todo Task 执行 `activate`
- **THEN** Buildr MUST 只把状态更新为 `active` 并保留 Task identity、scope 与复盘来源
- **AND** Application MUST NOT 自行创建 Environment、Change、Git branch 或专业记录

#### Scenario: 正常完成
- **WHEN** 调用方对 active Task 执行 `complete --summary <text>` 且没有 `--no-change`
- **THEN** Buildr MUST 写入 `status: completed` 与 `result.noChange: false`
- **AND** MUST 保留 Task identity、intent、scope、Change references 和复盘来源

#### Scenario: 无变更完成
- **WHEN** todo 或 active Task 在产生交付变更前确认无需修改，并执行 `complete --summary <text> --no-change`
- **THEN** Buildr MUST 写入 `status: completed` 与 `result.noChange: true`
- **AND** MUST NOT 创建或要求 Environment、Development、Candidate、Review、Verification 或 Finish 记录

#### Scenario: todo 尝试声明有变更完成
- **WHEN** 调用方对 todo Task 执行未带 `--no-change` 的 complete
- **THEN** Buildr MUST 返回 blocked 并要求先激活或明确无变更完成
- **AND** MUST 保持记录不变

#### Scenario: 放弃 Task
- **WHEN** 调用方对 todo 或 active Task 执行 `abandon --reason <text>`
- **THEN** Buildr MUST 写入 `status: abandoned` 和对应 summary
- **AND** abandoned result MUST NOT 包含 `noChange` 或伪造完成事实

#### Scenario: 终态再次 mutation
- **WHEN** 调用方尝试把 active 改回 todo，或对 completed/abandoned Task 执行 update、activate、complete 或 abandon
- **THEN** Buildr MUST 返回 blocked
- **AND** MUST 保持当前记录完整不变

### Requirement: Task Record mutation 必须由产品动作完成
Buildr MUST 通过 `create`、`inspect`、`update`、`activate`、`complete` 和 `abandon` 六个明确 Task Record Application action 管理 Task Record。`task-manager` Skill/CLI 与 Local App MUST只作为该 Application 的客户端；Agent、HTTP interface 和 Web feature MUST NOT直接编辑数据库、提交完整 next-state document 或自行生成系统字段。

#### Scenario: 创建 Task
- **WHEN** create 收到合法且尚不存在的 Task ID、title、intent、可选 `todo|active` status 与 scope/reference/source flags
- **THEN** Application MUST生成对应 Task Record 和系统时间
- **AND** repository MUST在同一 transaction 写入 Task 主记录和全部 scope/reference/source relations

#### Scenario: 更新 active Task
- **WHEN** update 收到至少一个明确的字段或关系 mutation，且当前状态为 active
- **THEN** Application MUST在 write transaction 内读取最新记录、应用明确操作、重新验证完整记录并更新 `updatedAt`
- **AND** omitted 字段 MUST保持不变，重复 add 或不存在的 remove MUST返回稳定结果而不得猜测

#### Scenario: 更新 todo Task
- **WHEN** update 收到至少一个明确的字段或关系 mutation，且当前状态为 todo
- **THEN** Application MUST使用与 active Task 相同的 transaction、完整记录验证和 `updatedAt` 规则
- **AND** todo 仍 MUST 拒绝 Change reference 与任何专业字段

#### Scenario: 激活 todo Task
- **WHEN** activate 收到当前 todo Task
- **THEN** Application MUST 只执行 todo-to-active transition
- **AND** MUST NOT执行任何 Git 或专业阶段动作

#### Scenario: inspect Task
- **WHEN** inspect 读取有效 Task ID
- **THEN** Application MUST只读返回当前完整逻辑记录和 response-level digest
- **AND** MUST NOT创建数据库、更新时间、状态、结果或任何业务字段

#### Scenario: mutation 输入不明确
- **WHEN** update 没有任何 mutation flag、同一字段同时 add/remove、或调用方试图通过未登记参数改变系统字段
- **THEN** CLI/Application MUST拒绝操作并返回对应 help/diagnostic
- **AND** Task Record transaction MUST rollback 或保持零写入

#### Scenario: 两个客户端执行同一动作
- **WHEN** Agent 通过 task-manager/CLI 或人通过 Local App 更新或结束 Task
- **THEN** 两个入口 MUST调用相同 Application action、validator、reference resolver 与 repository
- **AND** 任一客户端 MUST NOT维护第二套状态转换、默认值、SQL、schema migration 或 database writer

### Requirement: Local App Task API 必须保持 Workspace 写安全边界
Buildr MUST 在 `/api/v1/workspaces/:workspaceId/tasks` 及 Task identity 子路径提供 Workspace-scoped read/limited-write API，并 MUST 在调用 Task Record Application 前解析已登记 Workspace 的真实 canonical root。Task collection GET MUST 只接受封闭 query schema；所有保留的 mutation MUST 复用现有同源、session、JSON、body size、字段白名单和未知字段拒绝边界。Task collection POST 与 activate route MUST NOT 存在。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** 请求中的 `workspaceId` 已登记、可用且与 canonical Workspace identity 一致
- **THEN** HTTP interface MUST 只把该 Workspace 的真实 root 与明确 action/filter input 交给 Application
- **AND** 结果 MUST NOT 混入其他 Workspace 的 Task 或路径

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET 使用 `q`、`project`、`service`、`status`、`hasChildren`、`hasRetrospective` 或 `retrospectiveState`
- **THEN** HTTP interface MUST 规范化封闭 filter input 并调用 Task Record Application query projection
- **AND** `status` MUST 只接受 `open|todo|active|completed|abandoned|all`，其他过滤 MUST 保持其既有封闭值与组合语义

#### Scenario: Task API 提交路径或越界字段
- **WHEN** Task query/body 包含 `target`、`root`、`path`、未知 query、完整 next-state document、专业记录字段或其他未知字段
- **THEN** HTTP interface MUST 在读取或修改 Task Record 前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或任意其他 Workspace

#### Scenario: Task API 写请求不可信
- **WHEN** 保留的 mutation 缺少合法 Origin/session、不是允许的 JSON content type、超过 body limit 或 action fields 不完整
- **THEN** HTTP interface MUST 拒绝请求并保持 Task Record 不变
- **AND** MUST 返回现有 Local App error envelope 可表达的稳定诊断

## ADDED Requirements

### Requirement: Buildr 必须区分正式 Task、待办意向与普通交互
Buildr MUST 将 `active` 正式 Task 定义为已经对齐、准备产生持久交付变更并完成交付闭环的执行单元，将 `todo` Task 定义为已接受但尚未启动的持久改进意向，并 MUST 将两者的 Task identity 与 Agent host 的 task/thread、Task Context、OpenSpec Change、临时操作和普通对话区分。

#### Scenario: 已对齐持久交付意图
- **WHEN** 人与 Agent 已对齐需要创建或修改代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他持久交付物，并准备进入执行
- **THEN** Agent MUST 先确保存在稳定 Task ID 与 `active` Task Record
- **AND** OpenSpec Change MUST 只作为可选引用，不得代替 Task identity

#### Scenario: 接受但尚未启动的改进意向
- **WHEN** 人与 Agent 已确认一个后续改进值得保留，但尚未授权进入 Git 基线、Environment、Change、规划或实现
- **THEN** Agent MAY 创建最小 `todo` Task Record
- **AND** MUST NOT 为该 `todo` 生成任何文件系统 Task、专业记录或 OpenSpec artifact

#### Scenario: 纯讨论或只读探索
- **WHEN** 工作只包含讨论、只读探索、单次测试、临时服务、API 调用或尚未被接受的规划
- **THEN** Buildr MUST NOT 创建 Task ID、Task Record 或专业占位记录
- **AND** Agent host 的 task/thread id MUST NOT 被自动持久化为正式 Task ID

#### Scenario: 只维护生命周期元数据
- **WHEN** Agent 只是在已有 Task 中维护 Task 或专业模块 metadata
- **THEN** 该 metadata 写入 MUST NOT 递归创建另一份正式 Task

### Requirement: Task Record v2 必须只保存最小顶层事实与复盘来源
`buildr.task-record/v2` MUST 使用 closed schema，只保存 `schemaVersion`、`taskId`、`title`、`intent`、Project/Service scope、限定 Change references、可为空的 Parent、`retrospectiveSourceTaskIds`、`status`、`result`、`createdAt` 和 `updatedAt`；未知字段、不支持 schema 或 identity 不一致 MUST 被拒绝。

#### Scenario: 创建最小 active Task
- **WHEN** 调用方提供合法 Task ID、title、intent 与可为空的 scope、Change、Parent 和复盘来源集合，且省略 status
- **THEN** Buildr MUST 生成 `schemaVersion: buildr.task-record/v2`、`status: active`、`result: null` 和系统时间
- **AND** MUST 以 registry/Task authority 校验 Project、Service、Parent 与复盘来源 identity

#### Scenario: Task Manager 收到环境或专业字段
- **WHEN** 输入或已有记录包含 worktree、branch、runtime、CLI、dependency、path、process、port、resource、environment receipt、Development、Review、Verification、Finish、Board、Retrospective Result 或 action item 字段
- **THEN** Buildr MUST 拒绝该记录并报告字段级诊断
- **AND** MUST NOT 保存这些字段的内容、路径、revision 或 logical reference

#### Scenario: 收到未登记扩展字段
- **WHEN** 输入或已有记录包含 `revision`、`workspaceId`、`executionOwner`、`boardId`、通用 Task relations、`blocker`、专业 `records`、富文本 `overview` 或 publication/storage 状态
- **THEN** v2 validator MUST 将其视为未知字段并拒绝
- **AND** 产品 MUST NOT 为兼容旧草案静默丢弃后继续写入

#### Scenario: 输入机器本地结构化字段
- **WHEN** 输入尝试增加 worktree、branch、runtime、process、port、credential、log 或其他未登记的 Environment/机器字段
- **THEN** closed validator MUST 将该字段作为未知字段拒绝并保持原记录不变
- **AND** v2 MUST NOT 通过启发式文本扫描猜测 title、intent、result 或来源关系中的业务语义

### Requirement: Local App Task 列表必须支持 open 与封闭 SQLite 过滤
Task query projection MUST 支持关键词、Project、Service、`open|todo|active|completed|abandoned|all` status 与是否有直接 Child 的参数化过滤。关键词 MUST 对 title 与 intent 使用 OR，与其他条件使用 AND；空白关键词 MUST 等同未过滤，SQL wildcard 与注入输入 MUST 按普通文本安全处理。

#### Scenario: 组合过滤
- **WHEN** 调用方同时提供关键词、Project、Service、status 与 hasChildren
- **THEN** repository MUST 使用参数绑定按 AND 组合不同过滤维度，并在 title/intent 之间使用 OR
- **AND** status=open MUST 只匹配 todo 与 active

#### Scenario: Local App 默认 open
- **WHEN** 用户首次进入 Task 列表且未在页面选择其他状态
- **THEN** Web feature MUST 显式请求 `status=open`
- **AND** Application/repository 在未传 status 时 MUST 保持返回全部 Task 的兼容语义

#### Scenario: Project 与 Service 选项
- **WHEN** 页面生成 Project/Service 下拉选项
- **THEN** Application MUST 从 Task SQLite scope rows 读取 distinct identities，选择 Project 后页面 MUST 只展示该 Project 的 Service
- **AND** MUST NOT 为过滤选项读取 Project/Service filesystem registry

#### Scenario: 搜索请求发生竞态
- **WHEN** debounce 后的新查询在旧查询完成前发出
- **THEN** 页面 MUST 显示明确 loading，并 MUST 防止旧响应覆盖新条件结果
- **AND** 空结果 MUST 区分 Workspace 没有 Task 与当前筛选无结果

### Requirement: todo Task 必须保持数据式意向边界
`buildr.task-record/v2` MUST 允许创建显式 `todo` Task，并 MUST 要求其 Change references 为空。Task Environment、Task Development 与 Task Finish MUST 继续只接受 `active` Task；任何 reader MUST NOT 因 `todo` 存在而创建目录、专业 current row 或外部执行事实。

#### Scenario: 创建最小 todo Task
- **WHEN** create 收到合法 identity、title、intent、scope、可选复盘来源和 `status: todo`
- **THEN** repository MUST 只在 Workspace SQLite 中事务化保存 Task Record 与来源关系
- **AND** filesystem、Git、Environment、Development、Review、Verification、Finish 与 OpenSpec MUST 保持不变

#### Scenario: todo 关联 Change
- **WHEN** create 或 update 尝试让 todo Task 持有一个或多个 Change reference
- **THEN** Application MUST fail closed
- **AND** MUST 不保存部分 Task 或关系变更

### Requirement: Task Record 必须保存窄复盘来源关系
Task Record Application MUST 在 Workspace SQLite 中以多对多关系维护目标 Task 的 `retrospectiveSourceTaskIds`。目标 MUST 为 todo 或 active，源 Task MUST 为 completed 或 abandoned 且具有 current Retrospective Result；关系 MUST 禁止自引用并按目标/源组合去重。该关系 MUST NOT包含 action item、报告副本、digest、通用 relation type、Parent/Child 语义或执行计划。

#### Scenario: 多个复盘来源指向同一 Task
- **WHEN** 调用方创建或更新 todo/active Task，并提供多个不同的合法 terminal source Task ID
- **THEN** Application MUST 在同一 transaction 保存去重关系并在逻辑记录返回全部来源 ID
- **AND** 任一来源不合法时 MUST 整体 rollback

#### Scenario: 一个来源产生多个承接 Task
- **WHEN** 多个 todo/active Task 分别关联同一个合法 source Task
- **THEN** repository MUST 接受每条独立关系
- **AND** source Task 的反向查询 MUST 返回当前所有承接 Task，而不声明唯一 owner

#### Scenario: 关联已有 active Task
- **WHEN** 当前复盘改进已由已有 active Task 覆盖
- **THEN** Agent MUST 向该 Task 增加 source 关系而不重复创建 Task
- **AND** MUST NOT创建 action item 或把复盘建议与目标 Task 的当前方案绑定

#### Scenario: 修正来源关系
- **WHEN** 调用方对 todo/active Task 明确增加或移除 source Task ID
- **THEN** Application MUST 校验 expected record digest 并原子更新关系
- **AND** completed/abandoned 目标 MUST 保持不可修改

### Requirement: open 必须是非持久化 Task 查询状态
Task 查询 MUST 接受 `open` 并将其定义为 `todo + active`；MUST NOT 将 open 保存为 Task 状态、缓存集合或第二个 lifecycle authority。

#### Scenario: 查询 open Task
- **WHEN** 调用方以 `status=open` 查询 Task
- **THEN** query MUST 只返回 status 为 todo 或 active 的记录
- **AND** 每条记录 MUST 保留真实顶层 status

## REMOVED Requirements

### Requirement: Buildr 必须区分正式 Task 与普通交互
**Reason**: Task Record v2 新增已接受但尚未启动的 todo 意向，原有二分法已不完整。

**Migration**: 正式执行继续使用 active，普通交互仍不创建 Task；只有已接受的未启动意向可创建 todo。

### Requirement: Task Record v1 必须只保存首版顶层事实
**Reason**: v2 在保持最小顶层记录的同时增加 todo 与窄复盘来源关系。

**Migration**: SQLite migration 将既有 v1 记录原位升级为 v2，保留原 status、result、scope 与 references。

### Requirement: Local App Task 列表必须支持封闭 SQLite 过滤
**Reason**: 状态过滤已新增 todo 与派生 open，页面默认从 active 改为 open。

**Migration**: 原有关键词、scope、Child 和 active/terminal 过滤保持可用，新客户端默认请求 open。
