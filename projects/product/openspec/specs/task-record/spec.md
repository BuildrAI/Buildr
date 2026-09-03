# task-record Specification

## Purpose

定义正式Task identity、最小Task Record v3、canonical Workspace持久化、共享Application、CLI与Buildr Web客户端、四种顶层状态、结果更正、限定引用、复盘摘要与并发写入边界。

## Requirements

### Requirement: Task Record 必须拥有 canonical Workspace 路径
Buildr MUST 为每个正式 Task 在明确的 canonical Workspace 的唯一 Workspace structured store 中维护一条 canonical Task Record，并 MUST 让命令参数和记录内 `taskId` 完全一致。Task Record MUST NOT保存数据库path、row id、Workspace identity或Worktree identity；`.buildr/tasks/<task-id>/task.yml` MUST NOT再作为Task Record authority、fallback或兼容输入。

#### Scenario: 在 canonical Workspace 创建记录
- **WHEN** 调用方以已初始化的 canonical Workspace 为 target 创建合法 Task ID
- **THEN** Buildr MUST 在 `.buildr/local/workspace.sqlite` 的 Task-owned tables 中事务化创建记录
- **AND** MUST NOT在记录中复制`workspaceId`、database path、row id、checkout path或Worktree evidence

#### Scenario: 从Task Worktree发起调用
- **WHEN** 调用方当前位于Task Worktree但需要维护Task Record
- **THEN** 调用方 MUST 显式传入已由上游确认的 canonical Workspace target
- **AND** Task Record Application MUST NOT推断Worktree与retained root关系或保存任何Worktree字段

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
Buildr MUST通过`create`、`inspect`、`update`、`activate`、`complete`和`abandon`六个明确Task Record Application action管理Task Record。CLI、Buildr Web和上层Skill MUST只作为Application客户端；除create外的全部mutation MUST提交已观察`recordDigest`，并在同一write transaction内比较当前值。调用方MUST不直接编辑SQLite、提交完整next-state document或生成系统字段。

#### Scenario: 创建 Task
- **WHEN** create收到合法且尚不存在的Task ID、title、intent、可选`todo|active` status与scope/reference
- **THEN** Application MUST生成Task Record与系统时间并在一个transaction写入
- **AND** MUST不创建Change、Review、Verification、Worktree或其他专业事实

#### Scenario: 更新 Task
- **WHEN** update收到当前`recordDigest`和至少一个明确字段或关系mutation
- **THEN** Application MUST在transaction内重读、比较、应用并验证完整记录
- **AND** omitted字段 MUST保持不变

#### Scenario: 激活、完成或放弃 Task
- **WHEN** activate、complete或abandon收到当前`recordDigest`
- **THEN** Application MUST只执行对应Task Record mutation
- **AND** MUST不执行Git、验证、交付、环境或清理动作

#### Scenario: 并发修改
- **WHEN** 任一非create mutation提交的`recordDigest`不再匹配
- **THEN** Application MUST拒绝写入并返回当前digest
- **AND** caller MUST重新读取和判断，不得自动重放

#### Scenario: 更正已有终态业务事实
- **WHEN** update收到当前digest、明确原因及终态Task的合法业务事实修订
- **THEN** Application MUST保存旧status、title、intent、scope、Change、parent、isParent、result和时间
- **AND** 既有历史缺失字段 MUST原样保留，不得补造

#### Scenario: 更新 active Task
- **WHEN** update收到active Task当前digest与明确mutation
- **THEN** Application MUST原子更新并重算digest

#### Scenario: 更新 todo Task
- **WHEN** update收到todo Task当前digest与明确mutation
- **THEN** MUST使用相同CAS规则且继续拒绝Change引用

#### Scenario: 激活 todo Task
- **WHEN** activate收到todo Task当前digest
- **THEN** MUST只执行todo-to-active transition

#### Scenario: inspect Task
- **WHEN** inspect读取有效Task ID
- **THEN** MUST零写入返回当前Record、relations与digest

#### Scenario: mutation 输入不明确
- **WHEN** update没有mutation、字段冲突或缺少digest
- **THEN** MUST拒绝并保持记录不变

#### Scenario: 两个客户端执行同一动作
- **WHEN** CLI或Buildr Web修改同一Task
- **THEN** MUST调用相同Application、validator与repository
- **AND** 任一客户端 MUST不维护第二状态机

### Requirement: Change 引用必须在当前记录内可解析且无重复
Task Record MUST 使用 `{project, change}` 限定 OpenSpec Change，并 MUST 继续作为该逻辑关联的唯一可移植 owner。Application MUST 在新增引用时通过共享任务范围 Change 引用解析器（Task-scoped Change Reference Resolver），以 canonical Workspace、Task ID、matching Worktree与限定引用确认实际工作根或retained Project中的active/archived Change当前可解析；MUST只在当前记录内去重。Task Record MUST NOT保存checkout path、branch或provenance。

#### Scenario: Task 没有关联 Change
- **WHEN** 正式 Task 不需要 OpenSpec Change，或 Change 尚未创建
- **THEN** writer MUST 接受空 `changes` 集合
- **AND** MUST NOT 创建、推断或选择虚假 Change

#### Scenario: 同一 Task 关联多个 Change
- **WHEN** 一个 Task 关联一个或多个 Project 中的多个真实 Change
- **THEN** writer MUST 保存去重后的 `0..N` 个 `project/change` 引用
- **AND** 跨 Project 同名 Change MUST 通过 Project code 无歧义区分

#### Scenario: 新 Change 只存在于matching Worktree
- **WHEN** 调用方新增 `project/change` 引用，且 Change 只存在于matching Worktree的Project根
- **THEN** Resolver MUST将其识别为可解析的working-copy Change，Application MUST接受该逻辑引用
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
Buildr MUST允许Task保存至多一个canonical Workspace内的直接`parentTaskId`，并 MUST从同一Task authority动态投影排序后的直接Child摘要。反向`childTaskIds`与Child数量 MUST不进入Task Record schema、SQLite column、record digest或mutation input。

#### Scenario: 创建或修改 Parent 关系
- **WHEN** caller创建Child或把Task关联到一个合法active Parent
- **THEN** Application MUST只在Child row保存`parentTaskId`
- **AND** Parent relation projection MUST从反向查询返回该Child

#### Scenario: 读取没有 Child 的 Task
- **WHEN** Task没有直接Child
- **THEN** relation projection MUST返回空children
- **AND** Task Record MUST不返回`childTaskIds`

#### Scenario: 创建带 Parent 的 Task
- **WHEN** caller创建Task并提供合法active Parent
- **THEN** MUST原子创建Task与正向Parent关系

#### Scenario: 创建没有 Parent 的 Task
- **WHEN** caller创建独立Task
- **THEN** MUST保存`parentTaskId: null`

#### Scenario: 修改或清除 Parent
- **WHEN** caller以当前digest设置或清除Parent
- **THEN** MUST原子更新关系且不修改其他Task事实

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
Buildr Web MUST在已登记Workspace下提供Task轻量列表和详情，并允许人通过Task Record Application有限维护已有Task。Task概览 MUST NOT从复盘文档、Review、Verification、Git或其他专业事实推断lifecycle。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入Workspace Task列表
- **THEN** 页面 MUST从SQLite轻量projection显示Task事实和可选复盘登记状态
- **AND** MUST按`missing|pending-decision|decided`过滤但不得批量读取Markdown

#### Scenario: 查看 Task 详情
- **WHEN** 用户打开具体Task
- **THEN** 概览 MUST显示Task事实与复盘文档固定路径/登记摘要
- **AND** 正文 MUST仅在用户点击查看后单项读取

#### Scenario: 从 Buildr Web 创建或编辑 Task
- **WHEN** 用户编辑已有Task
- **THEN** HTTP MUST调用Task Record update并使用当前record digest
- **AND** 页面 MUST不创建Task或自动生成复盘

#### Scenario: Buildr Web 尝试创建 Task
- **WHEN** 页面或客户端尝试POST Task collection
- **THEN** HTTP MUST视为不存在
- **AND** Agent/Task Manager create能力 MUST保持可用

#### Scenario: 从 Buildr Web 完成或放弃 Task
- **WHEN** 用户明确完成或放弃active Task
- **THEN** 页面 MUST提交合法Task Record mutation
- **AND** 完成后 MUST不自动提示、生成或登记复盘

#### Scenario: Buildr Web 打开 terminal Task
- **WHEN** Task已completed或abandoned
- **THEN** 顶层业务字段 MUST保持只读，概览 MAY按需显示本机复盘卡片
- **AND** MUST不存在Environment或独立复盘Tab、重开入口或绕过Application的写入

### Requirement: Buildr Web Task API 必须保持 Workspace 写安全边界
Buildr MUST在Workspace-scoped Task路径提供list、detail、update、complete、abandon与单项复盘文档只读接口。接口 MUST解析canonical root，复用同源/session/JSON/body size/字段白名单与record digest边界，并 MUST不接受文件路径。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** workspaceId已登记且有效
- **THEN** HTTP MUST只把真实root和明确input交给Application
- **AND** MUST不混入其他Workspace事实

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET使用`q`、`project`、`service`、`status`、`hasChildren`或`retrospectiveState`
- **THEN** HTTP MUST通过closed Schema和mapping调用Task query
- **AND** MUST拒绝`hasRetrospective`与旧处置状态值

#### Scenario: Task API 提交路径或越界字段
- **WHEN** query/body包含`target`、`root`、`path`、未知字段或专业正文
- **THEN** HTTP MUST在读取或写入前拒绝
- **AND** MUST不回退cwd或调用方路径

#### Scenario: Task API 写请求不可信
- **WHEN** mutation缺少Origin/session、合法JSON、body boundary或必需字段
- **THEN** HTTP MUST拒绝并保持Task不变
- **AND** MUST返回稳定错误envelope

#### Scenario: Task API 输入校验不变异
- **WHEN** DTO含类型错误、缺失或未知字段
- **THEN** validator MUST不转换、填充或删除字段
- **AND** writer MUST不被调用

#### Scenario: Task API 返回既有 result family
- **WHEN** Task操作或复盘文档读取成功，或Application返回业务错误
- **THEN** response MUST匹配对应Schema
- **AND** Task mutation使用v5，detail/list使用v3/v5，文档读取使用独立v1响应

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

### Requirement: Buildr Web Task query projection 必须保持轻量且来自唯一 authority
Task Record Application MUST 为 Buildr Web 提供 stored-state query projection，并 MUST 只从 canonical Workspace SQLite Task authority 读取持久字段和直接关系。Projection MUST NOT 读取 filesystem registry 或调用Git、OpenSpec Change resolver、Development、Review、Verification、Finish reader。

#### Scenario: 批量读取 Task 列表
- **WHEN** Workspace 包含数百个 Task 且 Buildr Web 请求列表
- **THEN** repository MUST 通过不随 Task 数量线性增加的有限批量参数化查询组合 Task、scope、stored Change references 与直接关系摘要
- **AND** MUST NOT 对每个 Task 重复打开数据库或执行逐 Task relation query

#### Scenario: 返回 stored Change reference
- **WHEN** 轻量列表或详情包含一个已保存 `project/change` reference
- **THEN** projection MUST 保留该引用并允许 Buildr Web 构造具体 Change 链接
- **AND** MUST NOT 声称该引用当前 available、active、archived 或来自matching Worktree

#### Scenario: 进入具体 Change 页面
- **WHEN** 用户点击某个 stored Change reference
- **THEN** 具体 Change route MUST继续调用Task-scoped Change resolver，实时解析matching Worktree working copy与retained active/archive facts
- **AND** 当前不可用时 MUST 返回现有 fail-closed diagnostic

### Requirement: Buildr Web Task 列表必须支持 open 与封闭 SQLite 过滤
Task query projection MUST支持关键词、Project、Service、`open|todo|active|completed|abandoned|all` status、是否有直接 Child 与复盘文档 `missing|pending-decision|decided|all` 的参数化过滤。关键词 MUST对 title 与 intent 使用 OR，与其他条件使用 AND；空白关键词 MUST等同未过滤，SQL wildcard 与注入输入 MUST按普通文本安全处理。Application/repository 未传 status 时 MUST保持 `all` 兼容语义，Buildr Web 首次进入和清除页面筛选 MUST显式使用 `open`。

#### Scenario: 组合过滤
- **WHEN** 调用方同时提供关键词、Project、Service、status、hasChildren 与 retrospectiveState
- **THEN** repository MUST使用参数绑定按 AND 组合不同过滤维度，并在 title/intent 之间使用 OR
- **AND** `status=open` MUST只匹配 todo 与 active

#### Scenario: Buildr Web 默认 open
- **WHEN** 用户首次进入 Task 列表且未在页面选择其他状态
- **THEN** Web feature MUST显式请求 `status=open`
- **AND** Application/repository 在未传 status 时 MUST保持返回全部 Task 的兼容语义

#### Scenario: 复盘筛选查看终态
- **WHEN** 用户选择 `pending-decision` 或 `decided` 复盘筛选
- **THEN** Web MUST自动把页面状态筛选切换为 `all`
- **AND** 用户仍 MUST可主动选择其他合法 status

#### Scenario: Project 与 Service 选项
- **WHEN** 页面生成 Project/Service 下拉选项
- **THEN** Application MUST从 Task SQLite scope rows 读取 distinct identities，选择 Project 后页面 MUST只展示该 Project 的 Service
- **AND** MUST不为过滤选项读取 Project/Service filesystem registry

#### Scenario: 搜索请求发生竞态
- **WHEN** 新筛选请求在旧请求完成前发出
- **THEN** 页面 MUST显示明确 loading，并 MUST防止旧响应覆盖新条件结果
- **AND** 空结果 MUST区分 Workspace 没有 Task 与当前筛选无结果

### Requirement: Task 交付终态不得被后续维护 attention 撤销
Task Record的`completed` MUST只表达已确认的任务结果摘要，不表达机器交付证明。Git、部署、发布、Worktree、Preview或其他资源owner的pending/attention MUST保持独立，且 MUST不把已完成Task自动退回active、blocked或未交付。

#### Scenario: completed Task仍有cleanup attention
- **WHEN** Task结果已完成而Worktree或Preview尚未安全清理
- **THEN** Task Record MUST保持completed，具体资源owner MUST返回自己的cleanup attention
- **AND** Agent MUST能继续处理清理且用户可以查看Task结果和按需复盘

### Requirement: 完成记录必须与机器交付证明分离
任务应用（Application）MUST只保存已完成目标的真实摘要和适用的父任务完成依据，并保护对象身份与版本冲突。`completed` MUST不被解释为自动验证Git、部署、发布或外部系统交付；缺少Review、Verification或任何旧收尾历史 MUST不降低Task结果。

#### Scenario: 直接完成的任务
- **WHEN** 任务通过complete动作结束且没有Review、Verification或机器交付记录
- **THEN** Task Record MUST正常返回`completed`与结果摘要
- **AND** MUST不生成`delivered=false`、历史缺失或补造关联提示

#### Scenario: 已有历史证明
- **WHEN** 历史文档或归档Change包含旧交付证据
- **THEN** 它 MAY继续作为历史证据保留
- **AND** 当前Task查询 MUST不读取、迁移或投影为运行状态

#### Scenario: 内部读取失败
- **WHEN** Review、Verification、Git或资源owner读取失败
- **THEN** 失败 MUST只影响依赖该读取的动作或区域
- **AND** Task Record中已经成立的结果 MUST保持不变

### Requirement: 完成命令必须传递已观察任务版本
已有 `task complete` MUST支持 `--expected-record <recordDigest>`，通过既有任务记录应用在同一写事务中校验。独立收尾 MUST传入刚观察的摘要；冲突 MUST保留记录，不覆盖新目标。旧自动收尾专用完成写入口 MUST退役。

#### Scenario: 并发更新
- **WHEN** 智能体观察记录后其他入口更新任务
- **THEN** 原摘要完成请求 MUST拒绝写入，重读后才能重新判断。

#### Scenario: 摘要匹配
- **WHEN** 任务结果真实完成且当前摘要匹配
- **THEN** 原完成动作 MUST保存结果，不创建交接或旧执行记录。

### Requirement: 任务必须保留显式父任务身份
任务 MUST 支持显式父任务身份，已有直接子任务或旧父计划也按父任务保护；建立子关系时 MUST 保留父身份，解除最后一个子关系不能消除完成保护。历史任务不补造完成授权。

#### Scenario: 尚无子任务
- **WHEN** 创建显式父任务但尚未拆分
- **THEN** MUST 在完成时要求父任务完成依据。

#### Scenario: 移除最后子任务
- **WHEN** 已成为父任务的记录不再具有直接子任务
- **THEN** MUST 仍保留父身份。

### Requirement: 父任务完成必须校验并保存授权与验收
父任务完成 MUST 提供非空总体验收说明、精确覆盖直接子任务的处置、明确用户授权来源及原意、已观察任务版本和父子结果观察身份。检查 MUST 在同一写事务内完成；成功 MUST 保存依据和记录时间，失败 MUST 零状态写入。

#### Scenario: 缺少授权
- **WHEN** 调用完成父任务且未提供明确授权
- **THEN** MUST 拒绝完成，保留当前状态。

#### Scenario: 当前结果有授权
- **WHEN** 整体目标通过验收、子任务均终态、处置完整、版本当前且用户明确授权
- **THEN** MUST 仅完成指定父任务并保存验收、授权来源与观察身份。

#### Scenario: 子任务仍未结束
- **WHEN** 任一直系子任务仍为 todo 或 active
- **THEN** MUST 拒绝父任务完成，不自动放弃或完成子任务。

#### Scenario: 观察后发生变化
- **WHEN** 父子关系、目标、范围或子任务结果在读取后改变
- **THEN** MUST 拒绝陈旧完成输入并要求重新读取。

#### Scenario: 遗留及替代
- **WHEN** 某子任务已 abandoned
- **THEN** MUST 要求总体验收逐项说明其处置，不把 abandoned 等同交付。

#### Scenario: 普通任务
- **WHEN** 普通任务没有父身份或子任务
- **THEN** MUST 保持原有完成输入与独立状态。

### Requirement: Task 顶层状态与结果必须保持一致并允许显式更正
Task Record status MUST只有`todo`、`active`、`completed`和`abandoned`。`result`在todo或active时 MUST为`null`，在终态时 MUST只保存非空`summary`及适用的`parentCompletion`；MUST不保存`noChange`、交付、Git、验证、环境、发布或执行事实。状态变化和终态更正 MUST绑定当前digest；终态更正 MUST提供原因并保存历史。

#### Scenario: 完成 Task
- **WHEN** caller以当前digest和真实摘要完成todo或active Task
- **THEN** Buildr MUST写入`completed`和summary
- **AND** MUST不要求或保存`noChange`

#### Scenario: 放弃 Task
- **WHEN** caller以当前digest和原因放弃todo或active Task
- **THEN** Buildr MUST写入`abandoned`和summary
- **AND** MUST不伪造完成或交付事实

#### Scenario: 父任务完成
- **WHEN** parent completion包含当前父子snapshot、总体验收、逐Child处置和明确授权
- **THEN** Application MUST重验当前完成相关事实后保存依据
- **AND** snapshot MUST不包含旧Parent Plan、复盘、专业可选结果或更正历史

#### Scenario: 激活待办 Task
- **WHEN** Agent以当前digest激活todo Task
- **THEN** MUST只写`active`且不创建其他专业事实

#### Scenario: 正常完成
- **WHEN** caller以当前digest和摘要完成active Task
- **THEN** MUST保存completed与summary且不保存结果分类

#### Scenario: 无变更完成
- **WHEN** todo或active Task确认目标无需产生修改
- **THEN** caller MUST在summary中表达该结果并正常完成
- **AND** MUST不保存`noChange`

#### Scenario: todo 尝试声明有变更完成
- **WHEN** caller完成todo Task
- **THEN** Application MUST只判断目标结果、摘要和父任务授权
- **AND** MUST不从旧`noChange`推导是否允许

#### Scenario: 终态再次 mutation
- **WHEN** caller以当前digest和原因更正终态Task
- **THEN** MUST保存历史并更新当前事实

#### Scenario: 更新不能绕过完成授权
- **WHEN** update把父任务设为completed但缺少当前授权或snapshot
- **THEN** MUST拒绝写入

#### Scenario: 陈旧或伪造更正
- **WHEN** digest陈旧、缺少原因或试图写系统/专业事实
- **THEN** MUST拒绝并保留当前记录与历史

### Requirement: Task Record 必须拥有旧 Parent Plan 的只读历史位置
Buildr MUST在Task-owned SQLite row中保存从旧Development Receipt一次性迁移的nullable `legacy_parent_plan_json`。该值 MUST仅供Parent inspect历史展示，不得提供新writer、current applicability、计划推进或完成判断。

#### Scenario: 迁移有效旧 Parent Plan
- **WHEN** migration发现Task Development current中存在有效`parentPlan`
- **THEN** MUST将相同JSON值复制到所属Task row并校验Task identity与迁移数量
- **AND** MUST保留原Development payload不变

#### Scenario: 新父任务
- **WHEN** 新父任务使用当前轻量父子管理
- **THEN** `legacy_parent_plan_json` MUST保持null
- **AND** 计划 MUST继续由Task intent引用的真实文档或当前对话维护

#### Scenario: 历史内容损坏
- **WHEN** Parent inspect无法解析旧历史值
- **THEN** MUST返回局部historical diagnostic并继续展示Task、Parent/Children和结果
- **AND** MUST NOT回退读取Development current

### Requirement: Task Record 必须独立于已删除的研发与旧收尾数据
Task Record MUST在`task_development_current`和`task_finish_current`不存在时继续创建、查询、更新、完成和放弃任务。`legacy_parent_plan_json` MUST保留已迁移历史且不得回读Development表。

#### Scenario: 升级后读取历史任务
- **WHEN** migration已删除Development和Finish表
- **THEN** Task Record MUST保留原目标、范围、关系、状态、结果和legacy Parent Plan
- **AND** MUST不创建占位专业记录或机器交付结论

### Requirement: todo Task 必须保持最小数据意向边界
`buildr.task-record/v3` MUST允许显式`todo`且要求Change为空。Review与Verification只接受各自合法Task状态；复盘文档只能登记到terminal Task。reader MUST不因todo存在创建目录、current row或执行事实。

#### Scenario: 读取todo Task
- **WHEN** caller inspect一个todo Task
- **THEN** MUST只返回Task Record事实且`retrospective`为`null`
- **AND** MUST产生零专业写入和零环境副作用

### Requirement: Buildr Web Task 证据视图必须直接组合独立专业投影
Buildr Web MUST分别读取Review与Verification Application投影，并在任一结果缺失时正常展示另一个结果或空态。

#### Scenario: active Task没有Review或Verification结果
- **WHEN** 用户打开证据视图
- **THEN** 页面 MUST展示独立空态
- **AND** MUST不要求Task Candidate、研发回执或统一target

### Requirement: Task Record v3必须保存最小复盘文档事实
`buildr.task-record/v3` MUST删除`retrospectiveSourceTaskIds`并新增可空`retrospective`，其中只允许`documentDigest`与`state: pending-decision|decided`。Task Record MUST把固定本机`documentPath`作为只读派生值返回，不在SQLite保存正文或路径。

#### Scenario: 读取没有复盘文档的Task
- **WHEN** Task没有登记本机复盘文档
- **THEN** record的`retrospective` MUST为`null`
- **AND** 该值 MUST不产生失败、待办或自动提示

#### Scenario: 读取已登记文档
- **WHEN** 终态Task已登记合法文档摘要和决定状态
- **THEN** record MUST返回closed复盘文档事实和固定派生路径
- **AND** MUST不返回Markdown正文、旧处置字段或后续来源关系

### Requirement: Task Record必须受控维护复盘文档状态
Task Record update MUST支持登记当前固定文档、标记用户已决定和清除登记三种互斥操作。操作 MUST只接受终态Task并提交当前`recordDigest`；登记必须验证实际文件摘要，标记决定必须匹配已登记与当前文件版本，清除不得删除文件。

#### Scenario: 登记复盘文档
- **WHEN** Agent提交终态Task、当前recordDigest和固定文件的实际摘要
- **THEN** Application MUST保存摘要并设置`pending-decision`
- **AND** 同一事务外的文件或其他Task事实 MUST保持不变

#### Scenario: 标记用户已经决定
- **WHEN** 用户明确决定且调用方提交当前Task版本与已观察文档摘要
- **THEN** Application MUST只把匹配文档设为`decided`
- **AND** 摘要或Task版本漂移时 MUST拒绝写入

#### Scenario: 清除复盘登记
- **WHEN** 用户明确要求移除Task上的复盘关联
- **THEN** Application MUST把`retrospective`设为`null`
- **AND** MUST不删除或改写本机Markdown

### Requirement: Task查询必须直接过滤复盘文档决定状态
Task query MUST支持`retrospectiveState=missing|pending-decision|decided|all`并只读取Task-owned SQLite字段。旧`hasRetrospective`与`pending|handled|no-action`值 MUST退役。

#### Scenario: 查找等待人决定的复盘
- **WHEN** Buildr Web或其他Task查询提交`retrospectiveState=pending-decision`
- **THEN** repository MUST只返回登记状态匹配的Task
- **AND** MUST不读取Markdown、扫描文件系统或调用Agent

#### Scenario: 非法或退役过滤值
- **WHEN** 调用方提交`hasRetrospective`或旧处置状态
- **THEN** HTTP/Application MUST返回稳定字段诊断
- **AND** MUST不降级为`all`

### Requirement: Task Record必须提供固定复盘文档只读投影
Task Record HTTP MUST按Task ID读取固定本机Markdown并返回路径、存在性、实际摘要、登记摘要、登记状态、有效状态、正文和局部诊断。接口 MUST不接受路径或正文写入，并 MUST执行Task ID、普通文件、符号链接和固定体积边界检查。

#### Scenario: 查看当前文档
- **WHEN** Buildr Web请求已登记且摘要匹配的复盘文档
- **THEN** 接口 MUST返回完整Markdown与匹配状态
- **AND** MUST产生零文件和SQLite写入

#### Scenario: 文件缺失或变化
- **WHEN** 固定文件缺失或实际摘要与登记摘要不同
- **THEN** 接口 MUST返回局部availability/currentness诊断和其他Task事实
- **AND** MUST不自动更新状态或阻止其他Task操作

### Requirement: Task Record 读取必须隔离外部引用可用性
只要 SQLite 中 Task Record 自身结构有效，inspect、list、Buildr Web detail 与专业模块读取 MUST返回完整顶层记录。Project、Service 或 Change 当前不存在、已迁移或暂时不可解析时，Application MUST返回响应级局部 `referenceDiagnostics`，不得写回记录、删除/隐藏引用或建立统一健康状态。

#### Scenario: Project 或 Service 不可用
- **WHEN** 历史 Task 引用当前 registry 中不存在的 Project 或 Service
- **THEN** inspect、list 与 Web detail MUST返回同一 Task Record、关系、状态和结果
- **AND** MUST只为不可用引用返回带 kind 与 identity 的局部诊断

#### Scenario: Change 不可解析
- **WHEN** stored Change 当前在 retained Workspace 与 matching Worktree 均不可解析
- **THEN** Task Record MUST保持可读并返回 Change 局部诊断
- **AND** 只有真正打开或依赖该 Change 的动作 MUST失败

#### Scenario: 新增不存在引用
- **WHEN** create 或 update 新增当前不存在的 Project、Service 或 Change
- **THEN** Application MUST拒绝整个 mutation 并保持 Task Record 不变

#### Scenario: 删除失效引用或更新无关字段
- **WHEN** caller 提供当前 record digest 删除失效引用，或只修改 title/intent 等无关字段
- **THEN** mutation MUST不因保留的旧引用当前不可用而失败
- **AND** 写后响应 MUST重新计算剩余引用的局部诊断
