## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Local App 必须展示并适当管理 Task Record
Buildr Local App MUST 在已登记 Workspace 下提供 Task 核心导航、SQLite 轻量列表和详情，并 MUST 允许人通过 Task Record Application 编辑 active Task 以及明确完成或放弃 Task。Local App MUST NOT 提供正式 Task 创建入口；正式 Task 只由 Agent 通过 Task Manager/Application 创建。Task 概览 MUST NOT 从 Environment、worktree、branch、OpenSpec currentness、Review、Verification、Finish、Board 或 Retrospective 推断 lifecycle。

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

#### Scenario: 从 Local App 创建或编辑 Task
- **WHEN** 用户编辑 active Task 的 title、intent、Parent、scope 或 Change references
- **THEN** HTTP interface MUST 调用 update Application action 并返回最新 record
- **AND** 页面 MUST 使用与 CLI 相同的 identity、reference、closed schema、digest conflict 与 state validation

#### Scenario: Local App 尝试创建 Task
- **WHEN** 用户或客户端尝试从 Local App 页面或 Workspace-scoped Task collection POST route 创建正式 Task
- **THEN** 页面 MUST 不存在创建按钮和表单，HTTP interface MUST 将该 route 视为不存在或不支持
- **AND** Task Record Domain/Application、CLI 与 Task Manager Skill 的 create 能力 MUST 保持可用

#### Scenario: 从 Local App 完成或放弃 Task
- **WHEN** 用户对 active Task 选择完成或放弃
- **THEN** 页面 MUST 要求明确确认并提交非空 summary/reason；完成时 MUST 让用户明确选择是否为 no-change
- **AND** 确认文案 MUST 说明该动作只更新 Task 顶层状态，不执行 Finish、Git、Verification、Environment cleanup 或其他专业动作

#### Scenario: Local App 打开 terminal Task
- **WHEN** Task status 已是 completed 或 abandoned
- **THEN** 页面 MUST 将顶层业务字段和终态动作显示为只读/不可用
- **AND** Environment 页签 MAY 继续只读展示最终 cleanup 或 unavailable 事实，且 MUST NOT 提供重开、修改或绕过 Application validator 的入口

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

### Requirement: 单文件写入必须保留最后一份有效记录并拒绝陈旧页面
Task Record repository MUST只拥有 Workspace structured store 中的 `tasks`、`task_projects`、`task_services` 与 `task_changes` tables，并 MUST在单一 SQLite transaction 内维护一份完整有效逻辑记录。Application MUST对 domain-normalized logical record 计算不持久化的 `recordDigest`；Local App mutation MUST使用该摘要作为陈旧页面前置条件。该保证 MUST NOT被描述为持久 revision、自动合并或多人协同编辑协议。

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

#### Scenario: Local App 页面已经陈旧
- **WHEN** update、complete 或 abandon 携带的 `expectedRecordDigest` 与 transaction 内最新逻辑记录的 `recordDigest` 不一致
- **THEN** Application MUST返回 `task_record_conflict` 并提供 refresh next action
- **AND** MUST rollback、不得自动合并或用页面旧值覆盖当前记录

#### Scenario: 返回 Task Record read model
- **WHEN** Application 成功 inspect、list 或完成 mutation
- **THEN** read/result model MUST返回对应 current normalized logical record 的 `recordDigest`
- **AND** `recordDigest` MUST NOT出现在 Task Record closed schema、SQLite columns 或 Git publication 内容中

#### Scenario: 两个客户端近同时修改同一 Task
- **WHEN** Agent/CLI 与 Local App 或两个页面近同时修改同一 Task
- **THEN** SQLite transaction MUST串行化 writer，Application MUST至少拒绝已经可证明陈旧的 Local App mutation
- **AND** 产品 MUST NOT声称本地 transaction 和 digest 提供远程多用户协调、租约或自动 merge

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
Buildr Local App MUST 将 Task 详情核心一级导航保持为“概览、研发、证据、环境”，并由Task Retrospective能力独立增加“复盘”Tab。“概览”MUST以Task Record为主体，并通过只读Task Overview Application附加各专业current最小摘要；“研发”MUST只读投影Task Development；“证据”MUST组合Task Review与Task Verification两个独立reader；“环境”MUST继续只读投影Task Environment。页面 MUST NOT为组合展示建立聚合store、第二writer或新的Task lifecycle state。

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

### Requirement: Local App Task query projection 必须保持轻量且来自唯一 authority
Task Record Application MUST 为 Local App 提供 stored-state query projection，并 MUST 只从 canonical Workspace SQLite Task authority 读取持久字段和直接关系。Projection MUST NOT 读取 filesystem registry 或调用 Environment、Git、OpenSpec Change resolver、Development、Review、Verification、Finish reader。

#### Scenario: 批量读取 Task 列表
- **WHEN** Workspace 包含数百个 Task 且 Local App 请求列表
- **THEN** repository MUST 通过不随 Task 数量线性增加的有限批量参数化查询组合 Task、scope、stored Change references 与直接关系摘要
- **AND** MUST NOT 对每个 Task 重复打开数据库或执行逐 Task relation query

#### Scenario: 返回 stored Change reference
- **WHEN** 轻量列表或详情包含一个已保存 `project/change` reference
- **THEN** projection MUST 保留该引用并允许 Local App 构造具体 Change 链接
- **AND** MUST NOT 声称该引用当前 available、active、archived 或来自 matching Task Environment

#### Scenario: 进入具体 Change 页面
- **WHEN** 用户点击某个 stored Change reference
- **THEN** 具体 Change route MUST 继续调用 Task-scoped Change resolver，实时解析 matching Task Environment candidate 与 retained active/archive facts
- **AND** 当前不可用时 MUST 返回现有 fail-closed diagnostic

### Requirement: Local App Task Overview 必须组合专业 current 摘要且不扩张 Task Record authority
Buildr MUST为单个Task提供独立只读Task Overview Application。它MUST以Task Record为任务身份/顶层状态authority，并通过一个Workspace SQLite联表查询组合Development、Planning/Completion Review、Verification、Environment与Finish的最小current摘要；MUST NOT把专业status/identity/outcome写入`tasks`、Task Record JSON、record digest或Task Record mutation input。

#### Scenario: 打开 Task 概览
- **WHEN** Local App请求真实Task的Overview
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

### Requirement: Local App Task 列表必须支持复盘处置状态过滤
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
