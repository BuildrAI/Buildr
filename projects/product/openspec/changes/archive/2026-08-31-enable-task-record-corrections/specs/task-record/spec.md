## REMOVED Requirements

### Requirement: Task 顶层状态与结果必须保持单向语义
**Reason**: 单向终态不支持用户明确更正错误记录。
**Migration**: 旧记录不自动改写；通过已有update动作进行有版本校验、原因及历史保留的显式更正。

#### Scenario: 旧单向限制退出
- **WHEN** 用户通过更新入口明确更正任务事实
- **THEN** MUST采用新的状态一致性与历史保留要求，不再套用终态不可更正规则。

## ADDED Requirements

### Requirement: Task 顶层状态与结果必须保持一致并允许显式更正
Task Record status MUST 只有 `todo`、`active`、`completed` 和 `abandoned`。`result` 在 todo 或 active 时 MUST 为 `null`，在终态时 MUST 保存简短 summary；completed result MUST 明确 `noChange: true|false`。既有activate、complete和abandon保持原动作边界；update MUST支持四种状态的显式设置，并校验最终记录。状态变化和终态字段更正 MUST绑定已观察版本；终态更正 MUST提供原因并在同一事务保存只读resultHistory。进入completed MUST复用既有完成条件与父任务授权，不得同时改变验收对象；更正已完成父任务的目标或范围时 MUST显式恢复进行中，不能沿用旧完成依据；身份、时间、历史及专业结果 MUST NOT接受直接覆盖。

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
- **WHEN** 调用方通过update显式更正状态或终态事实，且提供当前版本与适用更正原因
- **THEN** Buildr MUST在同一事务保存被更正的终态事实并更新当前记录，active/todo的当前result恢复为null
- **AND** MUST保持身份与其他任务状态，旧专用终态动作仍不得隐式重开

#### Scenario: 更新不能绕过完成授权
- **WHEN** update请求把父任务设置为completed但没有明确用户授权或验收对象变化
- **THEN** MUST拒绝写入；update与complete共享同一完成安全边界。

#### Scenario: 陈旧或伪造更正
- **WHEN** 请求版本陈旧、缺少更正原因，或直接写入历史、系统时间和专业证据
- **THEN** MUST拒绝写入，保留当前记录和历史。

## MODIFIED Requirements

### Requirement: Parent Task 关系必须保持有效且无循环
Application MUST 在写入前验证 Parent 存在、处于 active、与 Child 位于同一 canonical Workspace，并 MUST 沿祖先链拒绝自引用和任意深度循环。关系验证失败 MUST rollback 整个 mutation。

#### Scenario: 拒绝自引用
- **WHEN** Task 尝试把自己的 Task ID 设置为 Parent
- **THEN** Application MUST 返回稳定的 self-reference diagnostic
- **AND** MUST NOT 写入任何关系或更新时间

#### Scenario: 拒绝祖先循环
- **WHEN** 设置 Parent 会使当前 Task 出现在候选 Parent 的祖先链中
- **THEN** Application MUST 返回稳定的 cycle diagnostic
- **AND** MUST 保留全部原关系不变

#### Scenario: Parent 不存在或已终态
- **WHEN** create/update 指向不存在、completed 或 abandoned 的 Parent Task
- **THEN** Application MUST fail closed 并返回可操作 diagnostic
- **AND** MUST NOT 自动创建、重开或修改 Parent Task

#### Scenario: 终态 Child 修改关系
- **WHEN** completed 或 abandoned Child 尝试设置或清除 Parent
- **THEN** Application MUST在提供当前版本与更正原因且关系合法时允许修改，并保留原状态和结果
- **AND** 原关系 MUST随更正历史保留，其他Task状态 MUST不受影响

### Requirement: Task Record v2 必须只保存最小顶层事实与复盘来源
`buildr.task-record/v2` MUST 使用 closed schema，只保存 `schemaVersion`、`taskId`、`title`、`intent`、Project/Service scope、限定 Change references、可为空的 Parent、`retrospectiveSourceTaskIds`、`status`、`result`、可选只读`resultHistory`、`createdAt` 和 `updatedAt`；未知字段、不支持 schema 或 identity 不一致 MUST 被拒绝。

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

### Requirement: Buildr Web Task API 必须保持 Workspace 写安全边界
Buildr MUST 在 `/api/v1/workspaces/:workspaceId/tasks` 及 Task identity 子路径提供 Workspace-scoped read/limited-write API，并 MUST 在调用 Task Record Application 前解析已登记 Workspace 的真实 canonical root。Task collection GET MUST 只接受封闭 query schema；list、detail、update、complete、abandon MUST由 Task HTTP Interfaces 自有的 Draft 2020-12 Schema 与稳定 operation catalog 约束，并 MUST将已验证 Interface DTO 显式映射为既有 Application Query/Command。所有保留的 mutation MUST 复用现有同源、session、JSON、body size、字段白名单和未知字段拒绝边界；`target|root|path`、未知/重复 query、缺少 `expectedRecordDigest`、record conflict与未改动动作的terminal/domain error MUST保持等价；PATCH新增status、reason、summary、noChange、parentCompletion及Change集合操作，MUST复用应用的状态更正与完成检查。Task collection POST 与 activate route MUST NOT 存在。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** 请求中的 `workspaceId` 已登记、可用且与 canonical Workspace identity 一致
- **THEN** HTTP interface MUST 只把该 Workspace 的真实 root 与明确 action/filter input 交给 Application
- **AND** 结果 MUST NOT 混入其他 Workspace 的 Task 或路径

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET 使用 `q`、`project`、`service`、`status`、`hasChildren`、`hasRetrospective` 或 `retrospectiveState`
- **THEN** HTTP interface MUST 通过 list request Schema 规范化封闭 filter DTO、显式映射并调用 Task Record Application query projection
- **AND** `status` MUST 只接受 `open|todo|active|completed|abandoned|all`，其他过滤 MUST 保持其既有封闭值与组合语义

#### Scenario: Task API 提交路径或越界字段
- **WHEN** Task query/body 包含 `target`、`root`、`path`、未知 query、完整 next-state document、专业记录字段或其他未知字段
- **THEN** HTTP interface MUST 在读取或修改 Task Record 前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或任意其他 Workspace

#### Scenario: Task API 写请求不可信
- **WHEN** 保留的 mutation 缺少合法 Origin/session、不是允许的 JSON content type、超过 body limit 或 action fields 不完整
- **THEN** HTTP interface MUST 拒绝请求并保持 Task Record 不变
- **AND** MUST 返回现有 Buildr Web error envelope 可表达的稳定诊断

#### Scenario: Task API 输入校验不变异
- **WHEN** mutation body 含可转换但类型错误的值、缺失必填字段或未知字段
- **THEN** Ajv validator MUST拒绝请求且 MUST NOT转换类型、填默认值或删除字段
- **AND** Task Record Application writer MUST不被调用

#### Scenario: Task API 返回既有 result family
- **WHEN** list、detail、update、complete 或 abandon 成功，或 Application 返回 conflict、terminal/domain error
- **THEN** HTTP response MUST匹配 operation 对应的成功或错误 Schema
- **AND** Schema/DTO 引入 MUST NOT改变既有公开 payload major、Application、Domain、Persistence、SQLite 或 writer authority

### Requirement: Task Record mutation 必须由产品动作完成
Buildr MUST 通过 `create`、`inspect`、`update`、`activate`、`complete` 和 `abandon` 六个明确 Task Record Application action 管理 Task Record。`task-manager` Skill/CLI 与 Buildr Web MUST只作为该 Application 的客户端；Agent、HTTP interface 和 Web feature MUST NOT直接编辑数据库、提交完整 next-state document 或自行生成系统字段。

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
- **WHEN** Agent 通过 task-manager/CLI 或人通过 Buildr Web 更新或结束 Task
- **THEN** 两个入口 MUST调用相同 Application action、validator、reference resolver 与 repository
- **AND** 任一客户端 MUST NOT维护第二套状态转换、默认值、SQL、schema migration 或 database writer

#### Scenario: 更正已有终态业务事实
- **WHEN** update收到当前版本、明确原因及已结束任务的字段、范围或关系修订
- **THEN** MUST允许合法修订，并保存被更正的终态上下文，不因原状态已结束而一律拒绝。

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
- **AND** completed/abandoned 目标 MAY通过既有来源关系操作维护引用，MUST保持其状态和结果；其他终态事实修改遵守显式更正规则
