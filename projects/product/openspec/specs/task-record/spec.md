# task-record Specification

## Purpose

定义正式 Task identity、最小 Task Record v1、canonical 路径、共享 Application、Skill/CLI 与 Local App 客户端、产品化创建/读取/更新/结束、三态结果、限定引用与失败边界。

## Requirements

### Requirement: Task Record 必须拥有 canonical Workspace 路径
Buildr MUST 为每个正式 Task 在明确的 canonical Workspace 的唯一 Workspace structured store 中维护一条 canonical Task Record，并 MUST 让命令参数和记录内 `taskId` 完全一致。Task Record MUST NOT保存数据库 path、row id、Workspace identity 或 Task Environment identity；`.buildr/tasks/<task-id>/task.yml` MUST NOT再作为 Task Record authority、fallback 或兼容输入。

#### Scenario: 在 canonical Workspace 创建记录
- **WHEN** 调用方以已初始化的 canonical Workspace 为 target 创建合法 Task ID
- **THEN** Buildr MUST 在 `.buildr/local/workspace.sqlite` 的 Task-owned tables 中事务化创建记录
- **AND** MUST NOT在记录中复制 `workspaceId`、database path、row id、checkout path 或 environment receipt

#### Scenario: 从 task environment 发起调用
- **WHEN** 调用方当前位于 task environment 但需要维护 Task Record
- **THEN** 调用方 MUST 显式传入已由上游确认的 canonical Workspace target
- **AND** Task Record Application MUST NOT读取 environment receipt、推断 worktree 与 retained root 关系或保存任何环境字段

#### Scenario: target 不是 canonical Workspace
- **WHEN** target 未初始化、指向 task worktree 副本、存在多个无法消歧的 Workspace root 或目标路径逃逸
- **THEN** Buildr MUST 在打开或写入数据库前返回 blocked
- **AND** MUST 保持候选 Task Record、Workspace database 与其他 Workspace 文件不变

#### Scenario: 判断 Git Workspace authority
- **WHEN** 已初始化 Workspace 同时位于 Git repository 中
- **THEN** Buildr MUST 根据真实 `git-dir` 与 `git-common-dir` 拓扑判断 target 是否为 linked worktree checkout
- **AND** MUST NOT仅根据路径是否包含 `.worktrees` 或 `.git` 是文件/目录判断 authority；非 Git Workspace MUST继续可用

#### Scenario: 跨 Agent 恢复
- **WHEN** Agent 更换 session、runtime 或 task worktree 后，以相同 canonical Workspace 和 Task ID inspect
- **THEN** Buildr MUST 从同一 Workspace structured store 返回同一份逻辑 Task Record
- **AND** MUST NOT依赖原 session、原 worktree或机器临时进程仍然存在

#### Scenario: 旧文件记录存在
- **WHEN** Workspace 仍包含一个或多个 `.buildr/tasks/<task-id>/task.yml`
- **THEN** Task Application MUST不扫描、读取、导入、删除或双写这些文件
- **AND** inspect/list MUST只返回 SQLite authority 中真实存在的 Task

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

### Requirement: Change 引用必须在当前记录内可解析且无重复
Task Record MUST 使用 `{project, change}` 限定 OpenSpec Change，并 MUST 继续作为该逻辑关联的唯一可移植 owner。Application MUST 在新增引用时通过共享任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），以 canonical Workspace、Task ID 与限定引用确认任务环境或 retained Project 中的 active/archived Change 当前可解析；MUST 只在当前记录内去重。Task Record MUST NOT 保存 Environment identity、checkout path、branch 或 provenance，Application MUST NOT 直接读取 Environment Receipt。

#### Scenario: Task 没有关联 Change
- **WHEN** 正式 Task 不需要 OpenSpec Change，或 Change 尚未创建
- **THEN** writer MUST 接受空 `changes` 集合
- **AND** MUST NOT 创建、推断或选择虚假 Change

#### Scenario: 同一 Task 关联多个 Change
- **WHEN** 一个 Task 关联一个或多个 Project 中的多个真实 Change
- **THEN** writer MUST 保存去重后的 `0..N` 个 `project/change` 引用
- **AND** 跨 Project 同名 Change MUST 通过 Project code 无歧义区分

#### Scenario: 新 Change 只存在于任务环境
- **WHEN** 调用方新增 `project/change` 引用，且 Change 只存在于 matching Task Environment 的 Project 执行根
- **THEN** Resolver MUST 将其识别为可解析的 `task-environment candidate`，Application MUST 接受该逻辑引用
- **AND** MUST NOT 要求先把 Change 写入 retained Project，也 MUST NOT 将执行根路径保存到 Task Record

#### Scenario: 当前记录重复引用
- **WHEN** create/update 尝试在同一 Task Record 中加入重复 `project/change`
- **THEN** Application MUST 返回稳定的 aligned/no-op 或 duplicate diagnostic
- **AND** MUST NOT 保存重复条目

#### Scenario: 其他 Task 引用相同 Change
- **WHEN** Workspace 中另一 Task Record 也引用相同 `project/change`
- **THEN** P0.2 MUST NOT 扫描其他记录或声明跨 Task ownership 冲突
- **AND** 当前操作 MUST 只依据当前记录、当前 Task-scoped resolution 和真实 Project/Change identity

#### Scenario: 既有 Change 引用当前不可用
- **WHEN** inspect/list 读取的有效 Task Record 含当前机器无法解析、已迁移或暂时缺失的既有 Change 引用
- **THEN** Application MUST 返回完整 Task Record 与每个引用的稳定 availability/provenance diagnostic
- **AND** MUST NOT 隐藏、丢弃、自动删除或把整条 Task Record 判为损坏

#### Scenario: 删除失效引用或修改无关字段
- **WHEN** active Task 的某个既有 Change 引用当前不可用，而调用方明确删除该引用或只修改 title/intent/其他 scope
- **THEN** Application MUST 允许可独立验证的 mutation，并重新验证最终完整记录
- **AND** MUST NOT 因未被新增的旧引用不可用而阻塞整个 mutation

### Requirement: Task Record writer 必须声明 local-only structured persistence
Task Record writer MUST声明 `buildr.task-record/v1` 的 persistence classification 为 Workspace-local structured data。声明 MUST NOT暴露数据库 path、table、row id、SQL、`recordDigest` 或扩大到其他 lifecycle owner；Development、Verification与Review虽进入同一SQLite，仍 MUST保持各自Application authority。

#### Scenario: consumer读取Task Record ownership
- **WHEN**合法consumer检查一个Task的持久化classification
- **THEN** Task Record writer MUST标记Workspace-local且不提供Git path
- **AND** MUST NOT包含旧`task.yml`、Environment、Development、Review、Verification或Finish路径

#### Scenario: Metadata Publication 请求 local-only Task Record ownership
- **WHEN**遗留caller尝试通过已清退的Metadata Publication取得Task Record ownership
- **THEN** capability graph MUST不存在可路由provider或binding，Task Record writer MUST不返回任何Git path
- **AND** MUST NOT导出数据库、旧`task.yml`或其他lifecycle owner的数据

#### Scenario: 历史引用当前不可用
- **WHEN**有效Task Record包含archived、retired或当前unavailable的Project/Service/Change引用
- **THEN** Task Record read model MUST保留逻辑record并返回availability diagnostic
- **AND** MUST NOT要求writer导出或改写Task Record才能继续读取其他专业current records

### Requirement: Task Record 必须支持最小 Parent Task 层级
Buildr MUST 允许 active Task 保存至多一个 canonical Workspace 内的直接 `parentTaskId`，并 MUST 从同一 Task authority 动态投影按 Task ID 排序的直接 `childTaskIds`。Parent/Child 关系 MUST NOT 复制 Task 正文、专业 Result 或整棵递归树。

#### Scenario: 创建带 Parent 的 Task
- **WHEN** 调用方创建 Task 并提供一个存在且 active 的 Parent Task ID
- **THEN** Application MUST 在同一 transaction 中创建 Task 与 Parent 关系
- **AND** Child read model MUST 返回该 `parentTaskId`，Parent read model MUST 返回该 Child ID

#### Scenario: 创建没有 Parent 的 Task
- **WHEN** 调用方创建普通独立 Task 且未提供 Parent Task
- **THEN** Task MUST 保存为 `parentTaskId: null`
- **AND** 该 Task 仍 MUST 能独立完成全部适用生命周期

#### Scenario: 修改或清除 Parent
- **WHEN** 调用方对 active Child Task 明确设置另一个 active Parent 或清除 Parent
- **THEN** Application MUST 原子更新关系并返回最新 Parent/Child read model
- **AND** MUST NOT 修改任一 Task 的 title、intent、scope、status 或专业记录

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
- **THEN** Application MUST 按终态不可修改规则拒绝 mutation
- **AND** 既有 Parent/Child 关系 MUST 保持可读

### Requirement: Parent 与 Child 必须保持独立生命周期
Parent Task 与 Child Task MUST 各自拥有独立 status、result 与专业 lifecycle facts。任一 Task 的 complete、abandon、Verification、Finish 或 cleanup MUST NOT 自动修改另一方，也 MUST NOT 仅因所有 Child 进入终态就自动完成 Parent。

#### Scenario: Child 完成
- **WHEN** 某个 Child Task 被明确 complete
- **THEN** Parent Task status MUST 保持不变
- **AND** Parent read model MUST 继续投影该 Child 及其真实终态

#### Scenario: Parent 完成且仍有 active Child
- **WHEN** 调用方明确完成一个仍有 active Child 的 Parent Task
- **THEN** Application MUST 只完成 Parent Task
- **AND** MUST NOT 完成、放弃、清理或改写任何 Child Task

### Requirement: 直接 Child 数量必须是非持久化查询派生事实
Buildr Web query projection MUST 将 `childTaskCount` 定义为当前 Task 的直接 Child 数量，并 MUST 从 `tasks.parent_task_id` 关系查询派生。该字段 MUST NOT 进入 `buildr.task-record/v1` closed schema、SQLite column、record digest 或 create/update input。

#### Scenario: 统计直接 Child
- **WHEN** Task 具有直接 Child 和更深层后代
- **THEN** `childTaskCount` MUST 只统计直接 Child，且 Child completed 或 abandoned 后数量 MUST 保持不变
- **AND** 递归后代 MUST NOT 进入该数量

#### Scenario: 按是否有 Child 过滤
- **WHEN** `hasChildren=yes` 或 `hasChildren=no`
- **THEN** repository MUST 根据 indexed `parent_task_id` 关系分别筛选至少一个直接 Child或没有直接 Child的 Task
- **AND** MUST NOT 依赖持久化计数、缓存、递归闭包或 filesystem scan

### Requirement: Parent 候选必须按需读取
Buildr Web Task 详情 MUST 在用户操作 Parent 字段前避免读取完整 Task 列表。Parent 候选 MUST 通过 active Task query projection 延迟加载，最终 Parent 合法性仍 MUST 由现有 Task Record Application mutation validation 决定。

#### Scenario: 打开详情首屏
- **WHEN** 用户只查看 Task 概览而未操作 Parent 字段
- **THEN** 页面 MUST NOT 请求 Task collection 作为 Parent 候选来源
- **AND** 当前 Parent 摘要 MUST 从单 Task query projection 展示

#### Scenario: 操作 Parent 字段
- **WHEN** 用户第一次 focus 或展开 Parent selector
- **THEN** 页面 MUST 请求 active Task query projection，并排除当前 Task
- **AND** 当前 Parent 已终态时页面 MUST 仍保留其只读当前选项，后端 MUST 继续拒绝不合法的新关系或循环

### Requirement: Formal Finish 正常完成必须复用 Task Record Application
Task Record Application MUST提供仅供经过验证的Task交付收敛调用的内部终态动作。该动作 MUST保持Task Record Application为顶层状态唯一writer，在单个数据库事务中把active Task写为`completed`与`result.noChange=false`；MUST对既有`completed/noChange=false`返回零写入的幂等成功；MUST拒绝覆盖`completed/noChange=true`、`abandoned`或损坏记录。该动作 MAY由自动Formal Finish或独立delivery reconciliation调用，但 MUST NOT公开为允许调用方声明交付成功的公共setter，也 MUST NOT触发Git交付、Environment cleanup、Parent/Child状态传播或其他专业动作。

#### Scenario: Finish 通过唯一 Application 完成 active Task
- **WHEN** 全部applicable repositories的current Task Contribution已经由真实远端事实证明交付
- **THEN** Task delivery reconciler MUST通过Task Record Application原子写入`status: completed`、确定性summary与`noChange: false`
- **AND** result MUST返回当前record、recordDigest与精确mutation effects

#### Scenario: 等价终态零写入
- **WHEN** 自动Finish或delivery reconciliation提交一个已经`completed/noChange=false`的Task
- **THEN** Task Record Application MUST返回当前终态与零mutation effects
- **AND** MUST NOT改写summary、updatedAt或Parent/Child关系

#### Scenario: 冲突终态不可覆盖
- **WHEN** 交付收敛目标Task已经`completed/noChange=true`或`abandoned`
- **THEN** Task Record Application MUST返回类型化冲突且effects为空
- **AND** 原Task Record MUST保持不变

### Requirement: Task Record 必须保持父子顶层状态独立
Task Record Application MUST继续只保存单Parent关系与各Task自身顶层状态；Contribution、Parent Plan、Child Result/progress和专业handoff MUST NOT进入Task Record，且Child终态 MUST NOT传播Parent终态。

#### Scenario: Child completed Parent active
- **WHEN** 绑定Parent的Child通过Finish进入completed
- **THEN** Parent Task status MUST保持active
- **AND** Parent Record MUST NOT写入Child status副本或completed count

### Requirement: superseded Child 必须使用 abandoned 终态
当显式Parent reconciliation确认已创建Child的全部范围被其他Child覆盖时，Agent MUST以明确superseded reason调用既有abandon action；部分覆盖 MUST先更新Child intent/Change只保留residual scope。

#### Scenario: 全部范围被覆盖
- **WHEN** active Child没有任何residual Contribution
- **THEN** Task Record MUST接受明确superseded reason的abandon
- **AND** MUST NOT提供自动completed转换

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

### Requirement: 单文件写入必须保留最后一份有效记录并拒绝陈旧 Buildr Web 页面
Task Record repository MUST只拥有 Workspace structured store 中的 `tasks`、`task_projects`、`task_services` 与 `task_changes` tables，并 MUST在单一 SQLite transaction 内维护一份完整有效逻辑记录。Application MUST对 domain-normalized logical record 计算不持久化的 `recordDigest`；Buildr Web mutation MUST使用该摘要作为陈旧页面前置条件。该保证 MUST NOT被描述为持久 revision、自动合并或多人协同编辑协议。

#### Scenario: 重复 Task ID
- **WHEN** SQLite authority 中有效 Task 已存在时再次 create
- **THEN** Buildr MUST返回 blocked 和 inspect next action
- **AND** MUST NOT覆盖、合并或重建现有记录

#### Scenario: Task 目录被其他内容占用
- **WHEN** `.buildr/tasks/<task-id>/` 不存在或只包含其他专业模块文件
- **THEN** Task Record repository MUST忽略该目录的存在形态
- **AND** MUST NOT移动、删除、覆盖或回滚任何 Environment、Development、Review、Verification、Finish 等 sibling 文件

#### Scenario: 损坏或不支持的记录
- **WHEN** inspect 或 mutation 遇到 database corruption、不支持的 record schema、constraint violation 或关系 identity 不一致
- **THEN** Buildr MUST fail closed 并返回原始稳定诊断
- **AND** MUST NOT自动修复、删除、部分重写或从旧 YAML 恢复

#### Scenario: 替换失败
- **WHEN** statement、constraint、busy timeout、validation 或 commit 失败
- **THEN** Buildr MUST rollback 当前 Task mutation 并保留最后一份完整有效逻辑记录
- **AND** MUST保持其他 Task 与专业 sibling records 不变

#### Scenario: Buildr Web 页面已经陈旧
- **WHEN** update、complete 或 abandon 携带的 `expectedRecordDigest` 与 transaction 内最新逻辑记录的 `recordDigest` 不一致
- **THEN** Application MUST返回 `task_record_conflict` 并提供 refresh next action
- **AND** MUST rollback、不得自动合并或用页面旧值覆盖当前记录

#### Scenario: 返回 Task Record read model
- **WHEN** Application 成功 inspect、list 或完成 mutation
- **THEN** read/result model MUST返回对应 current normalized logical record 的 `recordDigest`
- **AND** `recordDigest` MUST NOT出现在 Task Record closed schema、SQLite columns 或 Git publication 内容中

#### Scenario: 两个客户端近同时修改同一 Task
- **WHEN** Agent/CLI 与 Buildr Web 或两个页面近同时修改同一 Task
- **THEN** SQLite transaction MUST串行化 writer，Application MUST至少拒绝已经可证明陈旧的 Buildr Web mutation
- **AND** 产品 MUST NOT声称本地 transaction 和 digest 提供远程多用户协调、租约或自动 merge

### Requirement: Buildr Web 必须展示并适当管理 Task Record
Buildr Web MUST 在已登记 Workspace 下提供 Task 核心导航、SQLite 轻量列表和详情，并 MUST 允许人通过 Task Record Application 编辑 active Task 以及明确完成或放弃 Task。Buildr Web MUST NOT 提供正式 Task 创建入口；正式 Task 只由 Agent 通过 Task Manager/Application 创建。Task 概览 MUST NOT 从 Environment、worktree、branch、OpenSpec currentness、Review、Verification、Finish、Board 或 Retrospective 推断 lifecycle。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks`
- **THEN** 页面 MUST 从 SQLite authority 的轻量 query projection 列出匹配过滤条件的 Task ID、title、intent、Project/Service scope、stored Change references、status、直接 Child 数量、terminal result 摘要和 `updatedAt`
- **AND** MUST 支持按复盘 current row 是否存在筛选任务
- **AND** MUST NOT 为列表调用 Environment、Git、OpenSpec Change resolution、Development、Review、Verification 或 Finish reader

#### Scenario: 查看 Task 详情
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks/:taskId`
- **THEN** Task 概览 MUST 只读取该 Task 的 current stored record、Parent/Child 摘要、stored references、派生 `childTaskCount` 与 response-level digest
- **AND** MUST NOT 阻塞读取完整 Task 列表或任何专业 currentness

#### Scenario: 查看 Task Environment
- **WHEN** 用户选择 Task 详情的“环境”页签
- **THEN** 页面 MUST 只读展示 Task Environment Application 返回的当前机器 read model，并与 Task Record 概览分开
- **AND** MUST NOT 提供 prepare/cleanup/resource mutation、直接 receipt 编辑或把 Environment 状态复制到 Task Record

#### Scenario: 从 Buildr Web 创建或编辑 Task
- **WHEN** 用户编辑 active Task 的 title、intent、Parent、scope 或 Change references
- **THEN** HTTP interface MUST 调用 update Application action 并返回最新 record
- **AND** 页面 MUST 使用与 CLI 相同的 identity、reference、closed schema、digest conflict 与 state validation

#### Scenario: Buildr Web 尝试创建 Task
- **WHEN** 用户或客户端尝试从 Buildr Web 页面或 Workspace-scoped Task collection POST route 创建正式 Task
- **THEN** 页面 MUST 不存在创建按钮和表单，HTTP interface MUST 将该 route 视为不存在或不支持
- **AND** Task Record Domain/Application、CLI 与 Task Manager Skill 的 create 能力 MUST 保持可用

#### Scenario: 从 Buildr Web 完成或放弃 Task
- **WHEN** 用户对 active Task 选择完成或放弃
- **THEN** 页面 MUST 要求明确确认并提交非空 summary/reason；完成时 MUST 让用户明确选择是否为 no-change
- **AND** 确认文案 MUST 说明该动作只更新 Task 顶层状态，不执行 Finish、Git、Verification、Environment cleanup 或其他专业动作

#### Scenario: Buildr Web 打开 terminal Task
- **WHEN** Task status 已是 completed 或 abandoned
- **THEN** 页面 MUST 将顶层业务字段和终态动作显示为只读/不可用
- **AND** Environment 页签 MAY 继续只读展示最终 cleanup 或 unavailable 事实，且 MUST NOT 提供重开、修改或绕过 Application validator 的入口

### Requirement: Buildr Web Task API 必须保持 Workspace 写安全边界
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
- **AND** MUST 返回现有 Buildr Web error envelope 可表达的稳定诊断

### Requirement: Buildr Web Task Environment API 必须保持 Workspace 读取安全边界
Buildr MUST 为 Task 详情提供 Workspace-scoped、只读的 Environment API，并 MUST 在调用 Task Environment Application `inspect` 前解析已登记 Workspace 与真实 Task ID。HTTP interface 与 Web feature MUST NOT 接收 `target/root/path`、直接读取 Environment Receipt/provider evidence 或自行判断 `ready / blocked / cleanup`。

#### Scenario: 打开 Environment 页签
- **WHEN** 用户打开 `/workspaces/:workspaceId/tasks/:taskId` 的“环境”页签
- **THEN** Buildr Web MUST 通过类似 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/environment` 的路径调用 Application `inspect`
- **AND** 响应 MUST 使用 no-store 语义并返回 current-machine source、`observedAt`、receipt availability、status、scopes/roots、Runtime/CLI/依赖/projection、provider evidence、resources 与 cleanup 摘要

#### Scenario: Environment 暂不可用
- **WHEN** Task 尚无 Receipt、当前机器没有对应环境、probe 发现 drift 或 Application 返回 blocked
- **THEN** 页面 MUST 显示明确 unavailable/no-receipt/drift/blocked 状态、观察时间与 next action
- **AND** MUST NOT 隐藏 Task Record、伪造 ready 或从 branch/worktree 名猜环境

#### Scenario: 刷新当前环境事实
- **WHEN** 用户打开页签、页面重新获得焦点或手动刷新
- **THEN** 页面 MUST 发起一次有界只读 probe 并以新的 `observedAt` 替换旧展示
- **AND** P0.2 MUST NOT 增加 WebSocket、后台持续订阅、全量高频轮询或 Environment mutation 按钮

#### Scenario: Environment API 请求路径输入
- **WHEN** 请求携带 `target`、`root`、`path`、receipt bytes 或其他未登记 filesystem input
- **THEN** HTTP interface MUST 在访问文件系统前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或其他 Workspace/Task

### Requirement: Buildr Web Task Review API 必须复用 Application 并保持只读
Buildr MUST 提供 Workspace-scoped `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/reviews`，在解析已登记 Workspace 与真实 Task 后调用 Task Review Application `inspect`。HTTP/Web 层 MUST NOT 接收 target/root/path、直接读取 Result 文件、计算 digest、派生 applicability 或提供 Result CRUD。

#### Scenario: 安全读取 Task Review
- **WHEN** 请求命中已登记 Workspace 和存在的 Task
- **THEN** API MUST 返回 Task Review operation read model，并使用 no-store 语义

#### Scenario: 越界或未知字段
- **WHEN** 请求包含 query 参数、filesystem path、target/root 或未知 Task
- **THEN** API MUST fail closed，MUST 不读取或创建任何 Review 文件

#### Scenario: 人从 Buildr Web 发起 Review
- **WHEN** 用户在“证据”视图的审查结果区块点击发起或重新审查
- **THEN** Buildr Web MUST 只生成带 Task ID 与 reviewType 的 Agent action
- **AND** MUST 不在浏览器或 HTTP handler 中直接提交、编辑或删除 Result

### Requirement: Buildr Web Task 详情必须使用四个一级信息视图
Buildr Web MUST 将 Task 详情核心一级导航保持为“概览、研发、证据、环境”，并由Task Retrospective能力独立增加“复盘”Tab。“概览”MUST以Task Record为主体，并通过只读Task Overview Application附加各专业current最小摘要；“研发”MUST只读投影Task Development；“证据”MUST组合Task Review与Task Verification两个独立reader；“环境”MUST继续只读投影Task Environment。页面 MUST NOT为组合展示建立聚合store、第二writer或新的Task lifecycle state。

#### Scenario: 打开 Task 详情
- **WHEN** 用户进入`/workspaces/:workspaceId/tasks/:taskId`
- **THEN** 页面 MUST提供“概览、研发、证据、环境”四个核心页签、继续提供独立“复盘”Tab，并默认打开“概览”
- **AND** MUST NOT同时保留独立一级“审查”或“验证”页签

#### Scenario: 查看概览摘要
- **WHEN** 用户查看“概览”
- **THEN** 页面 MUST显示Task Record顶层事实与Task Overview联表返回的专业presence/status/target/outcome/time摘要
- **AND** MUST明确Task status仍由Task Record拥有，不得把摘要写回Task Record

#### Scenario: 查看研发依据
- **WHEN** 用户从“研发”中的Planning、Verification或Completion gate查找依据
- **THEN** 页面 MUST在“证据”视图展示对应审查结果或验证结果
- **AND** 研发视图 MUST只展示最小gate reference与保存结论，不得复制完整Result

#### Scenario: 证据 reader 部分不可用
- **WHEN** Task Review或Task Verification任一读取失败或缺失
- **THEN** “证据”视图 MUST独立展示对应诊断或空状态，并保留另一reader的有效内容
- **AND** 概览、研发、复盘与环境视图 MUST不受影响

### Requirement: Buildr Web Task 证据视图必须组合独立 Task Review 投影
Buildr Web MUST 在 Task 详情“证据”视图中提供“审查结果（Review Results）”区块，通过 Task Review Application 展示 Planning 与 Completion 两个 current 槽位；Task Record 概览、closed schema、writer 与顶层状态 MUST 保持不变，MUST NOT 保存 Review path、digest、type、conclusion 或 applicability。

#### Scenario: 打开 Task 证据视图
- **WHEN** 用户在已登记 Workspace 的 Task 详情选择“证据”
- **THEN** 审查结果区块 MUST 展示两个固定槽位的 missing/present、target identity、method、completedAt、conclusion、reviewed、uncovered、findings 与 Application 返回的 applicability
- **AND** 页面 MUST 明确区分“slot 有结果”与“结果仍适用”

#### Scenario: current target 尚不可用
- **WHEN** Task Development 尚未提供 current plan/Candidate identity，或 API 没有获得同类型 current target
- **THEN** 已存在 Result MUST 显示 `unknown` 而不是 current
- **AND** Completion 缺少 Candidate 时 MUST 不显示伪 Candidate 或通过状态

#### Scenario: Task Record mutation
- **WHEN** 用户编辑、完成或放弃 Task Record
- **THEN** Task Record Application MUST 不读取、复制、删除或改写 `reviews/` 下任一文件

### Requirement: Buildr Web Task query projection 必须保持轻量且来自唯一 authority
Task Record Application MUST 为 Buildr Web 提供 stored-state query projection，并 MUST 只从 canonical Workspace SQLite Task authority 读取持久字段和直接关系。Projection MUST NOT 读取 filesystem registry 或调用 Environment、Git、OpenSpec Change resolver、Development、Review、Verification、Finish reader。

#### Scenario: 批量读取 Task 列表
- **WHEN** Workspace 包含数百个 Task 且 Buildr Web 请求列表
- **THEN** repository MUST 通过不随 Task 数量线性增加的有限批量参数化查询组合 Task、scope、stored Change references 与直接关系摘要
- **AND** MUST NOT 对每个 Task 重复打开数据库或执行逐 Task relation query

#### Scenario: 返回 stored Change reference
- **WHEN** 轻量列表或详情包含一个已保存 `project/change` reference
- **THEN** projection MUST 保留该引用并允许 Buildr Web 构造具体 Change 链接
- **AND** MUST NOT 声称该引用当前 available、active、archived 或来自 matching Task Environment

#### Scenario: 进入具体 Change 页面
- **WHEN** 用户点击某个 stored Change reference
- **THEN** 具体 Change route MUST 继续调用 Task-scoped Change resolver，实时解析 matching Task Environment candidate 与 retained active/archive facts
- **AND** 当前不可用时 MUST 返回现有 fail-closed diagnostic

### Requirement: Buildr Web Task Overview 必须组合专业 current 摘要且不扩张 Task Record authority
Buildr MUST为单个Task提供独立只读Task Overview Application。它MUST以Task Record为任务身份/顶层状态authority，并通过一个Workspace SQLite联表查询组合Development、Planning/Completion Review、Verification、Environment与Finish的最小current摘要；MUST NOT把专业status/identity/outcome写入`tasks`、Task Record JSON、record digest或Task Record mutation input。

#### Scenario: 打开 Task 概览
- **WHEN** Buildr Web请求真实Task的Overview
- **THEN** Application MUST返回Task Record、直接Parent/Children摘要、各专业row presence/status/target/outcome/updated time与Finish current/terminal摘要
- **AND** MUST不调用Environment probe、Git、Change resolver、专业writer或filesystem reader

#### Scenario: 顶层状态与专业状态不一致
- **WHEN** Task Record status与Environment、Development或Finish保存摘要形成可诊断不一致
- **THEN** Overview MUST以Task Record表达顶层status，并分别展示专业保存事实与一致性diagnostic
- **AND** MUST不选择任一专业状态反写Task Record或自动修复数据库

#### Scenario: Overview mutation请求
- **WHEN** client对Overview resource发送POST、PUT、PATCH或DELETE
- **THEN** HTTP interface MUST拒绝该请求且effects为空
- **AND** Task Record与全部专业current rows MUST保持不变

### Requirement: Buildr Web Task 列表必须支持复盘处置状态过滤
Task query projection MUST 支持闭合 `retrospectiveState=missing|pending|handled|no-action|all` 参数化过滤，并 MUST 直接消费 `task_retrospective_current` 的 current row 与处置状态；Task Record MUST NOT复制或改写 Retrospective 专业事实。现有 `hasRetrospective=yes|no|all` 查询 MUST 保持兼容。

#### Scenario: 筛选未复盘
- **WHEN** collection GET 使用 `retrospectiveState=missing`
- **THEN** repository MUST 只返回不存在 `task_retrospective_current` row 的 Task
- **AND** MUST NOT创建空复盘或从 Task status 推断复盘存在

#### Scenario: 筛选处置状态
- **WHEN** collection GET 使用 `retrospectiveState=pending|handled|no-action`
- **THEN** repository MUST 只返回存在 current row 且处置状态匹配的 Task
- **AND** MUST 使用参数绑定，不执行 filesystem、Agent 或其他专业 reader

#### Scenario: Web 选择复盘状态
- **WHEN** 用户在 Task 列表选择未复盘、待处理、已处理或无需处理
- **THEN** Web feature MUST 使用单一“复盘状态”控件提交对应 `retrospectiveState`
- **AND** 若当前仍是页面默认 `status=active`，Web feature MUST 显式切换为 `status=all`，避免用不可能组合隐藏 terminal 结果

#### Scenario: 保留是否复盘兼容查询
- **WHEN** 既有客户端继续提交 `hasRetrospective=yes|no|all`
- **THEN** HTTP/Application/repository MUST 保持原有存在性过滤语义
- **AND** 新 Web feature MUST NOT同时暴露第二个 `hasRetrospective` 控件

#### Scenario: 非法复盘状态
- **WHEN** collection GET 提交未知 `retrospectiveState` 或其他未知 query 字段
- **THEN** HTTP interface MUST 在查询 SQLite 前返回稳定字段诊断
- **AND** MUST NOT把未知值降级为 `all`

### Requirement: Buildr Web Task 列表必须支持 open 与封闭 SQLite 过滤
Task query projection MUST 支持关键词、Project、Service、`open|todo|active|completed|abandoned|all` status 与是否有直接 Child 的参数化过滤。关键词 MUST 对 title 与 intent 使用 OR，与其他条件使用 AND；空白关键词 MUST 等同未过滤，SQL wildcard 与注入输入 MUST 按普通文本安全处理。

#### Scenario: 组合过滤
- **WHEN** 调用方同时提供关键词、Project、Service、status 与 hasChildren
- **THEN** repository MUST 使用参数绑定按 AND 组合不同过滤维度，并在 title/intent 之间使用 OR
- **AND** status=open MUST 只匹配 todo 与 active

#### Scenario: Buildr Web 默认 open
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

### Requirement: Task 交付终态不得被后续维护 attention 撤销
Task Record的`completed/noChange=false` MUST只表达已验证的任务交付结果。retained activation、Environment cleanup、Finish transient cleanup或diagnostics retention的pending/attention MUST由专业read model独立展示，MUST NOT把已完成Task退回active、blocked或未交付。

#### Scenario: completed Task仍有cleanup attention
- **WHEN** Task已完成远端交付而Task Environment尚未安全清理
- **THEN** Task Record MUST保持completed，Task详情 MUST展示独立cleanup attention
- **AND** Agent MUST能继续处理清理且用户可以查看结果和进行任务复盘
