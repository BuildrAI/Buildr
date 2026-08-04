# task-record Specification

## Purpose

定义正式 Task identity、最小 Task Record v1、canonical 路径、共享 Application、Skill/CLI 与 Local App 客户端、产品化创建/读取/更新/结束、三态结果、限定引用与失败边界。

## Requirements

### Requirement: Buildr 必须区分正式 Task 与普通交互
Buildr MUST 将正式 Task 定义为已经对齐、准备产生持久交付变更并完成交付闭环的执行单元，并 MUST 将 Task identity 与 Agent host 的 task/thread、Task Context、OpenSpec Change、临时操作和普通对话区分。

#### Scenario: 已对齐持久交付意图
- **WHEN** 人与 Agent 已对齐需要创建或修改代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他持久交付物，并准备进入执行
- **THEN** Agent MUST 先确保存在稳定 Task ID 与 Task Record
- **AND** OpenSpec Change MUST 只作为可选引用，不得代替 Task identity

#### Scenario: 纯讨论或只读探索
- **WHEN** 工作只包含讨论、只读探索、单次测试、临时服务、API 调用或尚未进入执行的 Board 规划
- **THEN** Buildr MUST NOT 创建 Task ID、Task Record 或专业占位记录
- **AND** Agent host 的 task/thread id MUST NOT 被自动持久化为正式 Task ID

#### Scenario: 只维护生命周期元数据
- **WHEN** Agent 只是在已有正式 Task 中维护 Task 或专业模块 metadata
- **THEN** 该 metadata 写入 MUST NOT 递归创建另一份正式 Task

### Requirement: Task Record 必须拥有 canonical Workspace 路径
Buildr MUST 为每个正式 Task 在明确的 canonical Workspace 下维护唯一 `.buildr/tasks/<task-id>/task.yml`，并 MUST 让目录名、命令参数和记录内 `taskId` 完全一致。Task Record MUST NOT 保存 Task Environment identity 来定位该 Workspace。

#### Scenario: 在 canonical Workspace 创建记录
- **WHEN** 调用方以已初始化的 canonical Workspace 为 target 创建合法 Task ID
- **THEN** Buildr MUST 将记录写入 `.buildr/tasks/<task-id>/task.yml`
- **AND** MUST NOT 在记录中复制 `workspaceId`、checkout path 或 environment receipt

#### Scenario: 从 task environment 发起调用
- **WHEN** 调用方当前位于 task environment 但需要维护 Task Record
- **THEN** 调用方 MUST 显式传入已由上游确认的 canonical Workspace target
- **AND** Task Record Application MUST NOT 读取 environment receipt、推断 worktree 与 retained root 关系或保存任何环境字段

#### Scenario: target 不是 canonical Workspace
- **WHEN** target 未初始化、指向 task worktree 副本、存在多个无法消歧的 Workspace root 或目标路径逃逸
- **THEN** Buildr MUST 在写入前返回 blocked
- **AND** MUST 保持候选 Task Record 与其他 Workspace 文件不变

#### Scenario: 判断 Git Workspace authority
- **WHEN** 已初始化 Workspace 同时位于 Git repository 中
- **THEN** Buildr MUST 根据真实 `git-dir` 与 `git-common-dir` 拓扑判断 target 是否为 linked worktree checkout
- **AND** MUST NOT 仅根据路径是否包含 `.worktrees` 或 `.git` 是文件/目录判断 authority；非 Git Workspace MUST 继续可用

#### Scenario: 跨 Agent 恢复
- **WHEN** Agent 更换 session、runtime 或 task worktree 后，以相同 canonical Workspace 和 Task ID inspect
- **THEN** Buildr MUST 返回同一份 `task.yml`
- **AND** MUST NOT 依赖原 session、原 worktree 或机器临时资源仍然存在

### Requirement: Task Record v1 必须只保存首版顶层事实
`buildr.task-record/v1` MUST 使用 closed schema，只保存 `schemaVersion`、`taskId`、`title`、`intent`、Project/Service scope、限定 Change references、`status`、`result`、`createdAt` 和 `updatedAt`；未知字段、不支持 schema 或 identity 不一致 MUST 被拒绝。

#### Scenario: 创建最小 active Task
- **WHEN** 调用方提供合法 Task ID、title、intent 与可为空的 Project/Service/Change 集合
- **THEN** Buildr MUST 生成 `schemaVersion: buildr.task-record/v1`、`status: active`、`result: null` 和系统时间
- **AND** MUST 以 registry 校验已声明 Project/Service identity 与父子关系

#### Scenario: Task Manager 收到环境或专业字段
- **WHEN** 输入或已有记录包含 worktree、branch、runtime、CLI、dependency、path、process、port、resource、environment receipt、Development、Review、Verification、Finish、Board 或 Retrospective 字段
- **THEN** Buildr MUST 拒绝该记录并报告字段级诊断
- **AND** MUST NOT 保存这些字段的内容、路径、revision 或 logical reference

#### Scenario: 收到首版暂缓字段
- **WHEN** 输入或已有记录包含 `revision`、`workspaceId`、`executionOwner`、`boardId`、Task relations、`blocker`、专业 `records`、富文本 `overview` 或 publication/storage 状态
- **THEN** v1 validator MUST 将其视为未知字段并拒绝
- **AND** 产品 MUST NOT 为兼容旧草案静默丢弃后继续写入

#### Scenario: 输入机器本地结构化字段
- **WHEN** 输入尝试增加 worktree、branch、runtime、process、port、credential、log 或其他未登记的 Environment/机器字段
- **THEN** closed validator MUST 将该字段作为未知字段拒绝并保持原记录不变
- **AND** v1 MUST NOT 通过启发式文本扫描猜测 title、intent 或 result 中的业务语义

### Requirement: Task Record mutation 必须由产品动作完成
Buildr MUST 通过 `create`、`inspect`、`update`、`complete` 和 `abandon` 五个明确 Task Record Application action 管理 Task Record。`task-manager` Skill/CLI 与 Local App MUST 只作为该 Application 的客户端；Agent、HTTP interface 和 Web feature MUST NOT 直接编辑 YAML、提交完整 next-state document 或自行生成系统字段。

#### Scenario: 创建 Task
- **WHEN** `create` 收到合法且尚不存在的 Task ID、title、intent 与可选 scope/reference flags
- **THEN** Application MUST 生成 active Task Record 和 `createdAt/updatedAt`
- **AND** repository MUST 只创建精确 Task 目录与 `task.yml`，且 MUST NOT 把整个 Task 目录纳入跨文件 transaction 或 rollback

#### Scenario: 更新 active Task
- **WHEN** `update` 收到至少一个明确的 title/intent setter 或 scope/change add/remove flag，且当前状态为 active
- **THEN** Application MUST 从磁盘读取最新记录、应用明确操作、重新验证完整记录并更新 `updatedAt`
- **AND** omitted 字段 MUST 保持不变，重复 add 或不存在的 remove MUST 返回稳定结果而不得猜测

#### Scenario: inspect Task
- **WHEN** `inspect` 读取有效 Task ID
- **THEN** Application MUST 只读返回当前完整记录与 canonical path
- **AND** MUST NOT 更新时间、状态、结果或任何业务字段

#### Scenario: mutation 输入不明确
- **WHEN** `update` 没有任何 mutation flag、同一字段同时 add/remove、或调用方试图通过未登记参数改变系统字段
- **THEN** CLI/Application MUST 拒绝操作并返回对应 help/diagnostic
- **AND** Task Record bytes MUST 保持不变

#### Scenario: 两个客户端执行同一动作
- **WHEN** Agent 通过 `task-manager`/CLI 或人通过 Local App 创建、更新或结束 Task
- **THEN** 两个入口 MUST 调用相同 Application action、validator、reference resolver 与 repository
- **AND** 任一客户端 MUST NOT 维护第二套状态转换、默认值、YAML renderer 或 filesystem writer

### Requirement: Local App 必须展示并适当管理 Task Record
Buildr Local App MUST 在已登记 Workspace 下提供 Task 核心导航、列表和详情，并 MUST 允许人通过 Task Record Application 创建 Task、编辑 active Task 以及明确完成或放弃 Task。P0.1 Task 概览 MUST NOT 从尚未交付的专业记录推断 lifecycle；P0.2 MUST 在同一 Task 详情中以独立只读“环境”页签组合 Task Environment read model，而不得把环境字段或专业状态写入 Task Record。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks`
- **THEN** 页面 MUST 从当前已登记 Workspace 列出真实 Task ID、title、intent、Project/Service scope、status 和 `updatedAt`
- **AND** 空集合、损坏记录和不可用 Workspace MUST 分别显示可解释状态，不得虚构或静默跳过损坏 Task

#### Scenario: 查看 Task 详情
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks/:taskId`
- **THEN** Task 概览 MUST 展示该 Task 的完整最小 Task Record 与 terminal result（如有）
- **AND** MUST NOT 从 Environment、worktree、branch、Review、Verification、Finish、Board 或 Retrospective 推断或改写 Task 顶层状态

#### Scenario: 查看 Task Environment
- **WHEN** 用户选择 Task 详情的“环境”页签
- **THEN** 页面 MUST 只读展示 Task Environment Application 返回的当前机器 read model，并与 Task Record 概览分开
- **AND** MUST NOT 提供 prepare/cleanup/resource mutation、直接 receipt 编辑或把 Environment 状态复制到 Task Record

#### Scenario: 从 Local App 创建或编辑 Task
- **WHEN** 用户提交合法 Task ID、title、intent、scope 与 Change references，或编辑 active Task 的这些字段
- **THEN** HTTP interface MUST 调用对应 create/update Application action 并返回最新 record
- **AND** 页面 MUST 使用与 CLI 相同的 identity、reference、closed schema 与 state validation

#### Scenario: 从 Local App 完成或放弃 Task
- **WHEN** 用户对 active Task 选择完成或放弃
- **THEN** 页面 MUST 要求明确确认并提交非空 summary/reason；完成时 MUST 让用户明确选择是否为 no-change
- **AND** 确认文案 MUST 说明该动作只更新 Task 顶层状态，不执行 Finish、Git、Verification、Environment cleanup 或其他专业动作

#### Scenario: Local App 打开 terminal Task
- **WHEN** Task status 已是 completed 或 abandoned
- **THEN** 页面 MUST 将顶层业务字段和终态动作显示为只读/不可用
- **AND** Environment 页签 MAY 继续只读展示最终 cleanup 或 unavailable 事实，但 MUST NOT 提供重开、修改或绕过 Application validator 的入口

### Requirement: Local App Task API 必须保持 Workspace 写安全边界
Buildr MUST 在 `/api/v1/workspaces/:workspaceId/tasks` 及 Task identity 子路径提供 Workspace-scoped read/write API，并 MUST 在调用 Task Record Application 前解析已登记 Workspace 的真实 canonical root。所有 mutation MUST 复用现有同源、session、JSON、body size、字段白名单和未知字段拒绝边界。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** 请求中的 `workspaceId` 已登记、可用且与 canonical Workspace identity 一致
- **THEN** HTTP interface MUST 只把该 Workspace 的真实 root 与明确 action input 交给 Application
- **AND** 结果 MUST NOT 混入其他 Workspace 的 Task 或路径

#### Scenario: Task API 提交路径或越界字段
- **WHEN** Task query/body 包含 `target`、`root`、`path`、完整 next-state document、专业记录字段或其他未知字段
- **THEN** HTTP interface MUST 在读取或修改 Task Record 前拒绝请求
- **AND** MUST NOT 回退到 server cwd、调用方路径或任意其他 Workspace

#### Scenario: Task API 写请求不可信
- **WHEN** mutation 缺少合法 Origin/session、不是允许的 JSON content type、超过 body limit 或 action fields 不完整
- **THEN** HTTP interface MUST 拒绝请求并保持 Task Record bytes 不变
- **AND** MUST 返回现有 Local App error envelope 可表达的稳定诊断

### Requirement: Task 顶层状态与结果必须保持单向语义
Task Record status MUST 只有 `active`、`completed` 和 `abandoned`。`result` 在 active 时 MUST 为 `null`，在终态时 MUST 保存简短 summary；completed result MUST 明确 `noChange: true|false`。completed 与 abandoned MUST 不可重新打开或继续修改。

#### Scenario: 正常完成
- **WHEN** 调用方对 active Task 执行 `complete --summary <text>` 且没有 `--no-change`
- **THEN** Buildr MUST 写入 `status: completed` 与 `result.noChange: false`
- **AND** MUST 保留 Task identity、intent、scope 和 Change references

#### Scenario: 无变更完成
- **WHEN** active Task 在产生交付变更前确认无需修改，并执行 `complete --summary <text> --no-change`
- **THEN** Buildr MUST 写入 `status: completed` 与 `result.noChange: true`
- **AND** MUST NOT 创建或要求 Environment、Development、Candidate、Review、Verification 或 Finish 记录

#### Scenario: 放弃 Task
- **WHEN** 调用方对 active Task 执行 `abandon --reason <text>`
- **THEN** Buildr MUST 写入 `status: abandoned` 和对应 summary
- **AND** abandoned result MUST NOT 包含 `noChange` 或伪造完成事实

#### Scenario: 终态再次 mutation
- **WHEN** 调用方对 completed 或 abandoned Task 执行 update、complete 或 abandon
- **THEN** Buildr MUST 返回 blocked
- **AND** MUST 保持终态记录完整不变

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

### Requirement: 单文件写入必须保留最后一份有效记录并拒绝陈旧页面
Task Record repository MUST 只拥有 `.buildr/tasks/<task-id>/task.yml`，在完整 parse/validate/render 成功后才同目录原子替换该文件，并 MUST 在失败时保留原有效记录及同目录其他 owner 的文件。Application MUST 对有效 canonical bytes 计算不持久化的 `recordDigest`；Local App mutation MUST 使用该摘要作为陈旧页面前置条件。该保证 MUST NOT 被描述为目录级 transaction、持久 revision、锁、自动合并或多人协同编辑协议。

#### Scenario: 重复 Task ID
- **WHEN** 有效 `task.yml` 已存在时再次 create
- **THEN** Buildr MUST 返回 blocked 和 inspect next action
- **AND** MUST NOT 覆盖、合并或重建现有记录

#### Scenario: Task 目录被其他内容占用
- **WHEN** Task 目录已存在但没有普通、有效的 `task.yml`，或该路径包含其他专业模块文件
- **THEN** Buildr MUST 返回稳定的 occupied/corrupt diagnostic
- **AND** MUST NOT 把它误报为有效重复记录，也 MUST NOT 移动、删除、覆盖或回滚任何 sibling 文件

#### Scenario: 损坏或不支持的记录
- **WHEN** inspect 或 mutation 遇到无法解析的 YAML、不支持 schema 或目录名/`taskId` 不一致
- **THEN** Buildr MUST fail closed 并返回原始诊断
- **AND** MUST NOT 自动修复、移动、删除或部分重写

#### Scenario: 替换失败
- **WHEN** 临时写入、完整校验或同目录原子替换失败
- **THEN** Buildr MUST 保留原 `task.yml` bytes
- **AND** MUST 只清理可证明属于本次操作的临时文件或本次排他创建且仍为空的目录，并保持 Environment、Review、Verification、Finish 等 sibling 文件不变

#### Scenario: Local App 页面已经陈旧
- **WHEN** update、complete 或 abandon 携带的 `expectedRecordDigest` 与当前 canonical bytes 对应的 `recordDigest` 不一致
- **THEN** Application MUST 返回 `task_record_conflict` 并提供 refresh next action
- **AND** MUST NOT 写入、自动合并或用页面旧值覆盖当前记录

#### Scenario: 返回 Task Record read model
- **WHEN** Application 成功 inspect、list 或完成 mutation
- **THEN** read/result model MUST 返回对应当前 canonical bytes 的 `recordDigest`
- **AND** `recordDigest` MUST NOT 出现在 `task.yml`、Task Record closed schema 或 Git publication 内容中

#### Scenario: 两个客户端近同时修改同一 Task
- **WHEN** Agent/CLI 与 Local App 或两个页面近同时修改同一 Task
- **THEN** Application MUST 至少拒绝已经可证明陈旧的 Local App mutation，并保持最后一份完整有效记录
- **AND** 产品 MUST NOT 声称摘要与原子替换提供跨进程锁、租约、自动 merge 或多人协同编辑

### Requirement: Local App Task Environment API 必须保持 Workspace 读取安全边界
Buildr MUST 为 Task 详情提供 Workspace-scoped、只读的 Environment API，并 MUST 在调用 Task Environment Application `inspect` 前解析已登记 Workspace 与真实 Task ID。HTTP interface 与 Web feature MUST NOT 接收 `target/root/path`、直接读取 Environment Receipt/provider evidence 或自行判断 `ready / blocked / cleanup`。

#### Scenario: 打开 Environment 页签
- **WHEN** 用户打开 `/workspaces/:workspaceId/tasks/:taskId` 的“环境”页签
- **THEN** Local App MUST 通过类似 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/environment` 的路径调用 Application `inspect`
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

### Requirement: Local App Task Review API 必须复用 Application 并保持只读
Buildr MUST 提供 Workspace-scoped `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/reviews`，在解析已登记 Workspace 与真实 Task 后调用 Task Review Application `inspect`。HTTP/Web 层 MUST NOT 接收 target/root/path、直接读取 Result 文件、计算 digest、派生 applicability 或提供 Result CRUD。

#### Scenario: 安全读取 Task Review
- **WHEN** 请求命中已登记 Workspace 和存在的 Task
- **THEN** API MUST 返回 Task Review operation read model，并使用 no-store 语义

#### Scenario: 越界或未知字段
- **WHEN** 请求包含 query 参数、filesystem path、target/root 或未知 Task
- **THEN** API MUST fail closed，MUST 不读取或创建任何 Review 文件

#### Scenario: 人从 Local App 发起 Review
- **WHEN** 用户在“证据”视图的审查结果区块点击发起或重新审查
- **THEN** Local App MUST 只生成带 Task ID 与 reviewType 的 Agent action
- **AND** MUST 不在浏览器或 HTTP handler 中直接提交、编辑或删除 Result

### Requirement: Local App Task 详情必须使用四个一级信息视图
Buildr Local App MUST 将 Task 详情一级导航收敛为“概览、研发、证据、环境”。“概览”MUST 只承载 Task Record；“研发”MUST 只读投影 Task Development；“证据”MUST 组合 Task Review 与 Task Verification 两个独立 reader；“环境”MUST 继续只读投影 Task Environment。页面 MUST NOT 为组合展示建立聚合 store、第二 writer 或新的 Task lifecycle state。

#### Scenario: 打开 Task 详情
- **WHEN** 用户进入 `/workspaces/:workspaceId/tasks/:taskId`
- **THEN** 页面 MUST 只提供“概览、研发、证据、环境”四个一级页签，并默认打开“概览”
- **AND** MUST NOT 同时保留独立一级“审查”或“验证”页签

#### Scenario: 查看研发依据
- **WHEN** 用户从“研发”中的 Planning、Verification 或 Completion gate 查找依据
- **THEN** 页面 MUST 在“证据”视图展示对应审查结果或验证结果
- **AND** 研发视图 MUST 只展示最小 gate reference 与当前结论，不得复制完整 Result

#### Scenario: 证据 reader 部分不可用
- **WHEN** Task Review 或 Task Verification 任一读取失败或缺失
- **THEN** “证据”视图 MUST 独立展示对应诊断或空状态，并保留另一 reader 的有效内容
- **AND** 概览、研发与环境视图 MUST 不受影响

### Requirement: Local App Task 证据视图必须组合独立 Task Review 投影
Buildr Local App MUST 在 Task 详情“证据”视图中提供“审查结果（Review Results）”区块，通过 Task Review Application 展示 Planning 与 Completion 两个 current 槽位；Task Record 概览、closed schema、writer 与顶层状态 MUST 保持不变，MUST NOT 保存 Review path、digest、type、conclusion 或 applicability。

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
