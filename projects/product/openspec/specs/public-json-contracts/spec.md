# Buildr 公开 JSON 契约

## Purpose

定义 Buildr CLI 面向 Agent 和自动化的 JSON schema identity、兼容演进规则与自动覆盖要求。

## Requirements

### Requirement: 公开 JSON 输出必须声明 schema identity
Buildr 所有可通过受支持 CLI 命令获得的 `--json` 对象输出 MUST 在顶层声明非空 `schemaVersion`，并 MUST 为不同命令家族使用稳定的 `buildr.<payload>/v<major>` identity。

#### Scenario: Agent 读取公开 JSON
- **WHEN** Agent 运行任一支持 `--json` 的 Buildr CLI 命令
- **THEN** 输出 MUST 是单一有效 JSON 对象
- **AND** 顶层 MUST 包含与该命令家族匹配的 `schemaVersion`
- **AND** checkout 与 npm tarball CLI 对同一命令 MUST 使用相同 schema identity

#### Scenario: 非 JSON 输出
- **WHEN** 用户运行同一命令但没有请求 `--json`
- **THEN** Buildr MUST 保持既有人类可读输出
- **AND** Buildr MUST NOT 为文本输出增加 JSON envelope

### Requirement: JSON schema major 必须按兼容规则演进
Buildr public JSON schema 在同一 major identity 内 MUST 只进行兼容性扩展；删除字段、重命名字段、改变字段类型或改变既有字段语义 MUST 使用新的 schema major，并 MUST 通过 OpenSpec change 定义迁移。

#### Scenario: v1 增加字段
- **WHEN** Buildr 在 `buildr.<payload>/v1` 中新增字段
- **THEN** 新字段 MUST 是 additive
- **AND** 既有字段的名称、类型和语义 MUST 保持兼容

#### Scenario: 消费者遇到未知字段
- **WHEN** Agent 或自动化消费同一 schema major 中较新 Buildr 输出的未知字段
- **THEN** 消费者 MUST 忽略未知字段并继续按已知字段解析

#### Scenario: 需要破坏性变化
- **WHEN** JSON payload 需要删除、重命名、改变类型或改变既有字段语义
- **THEN** Buildr MUST 发布新的 `v<major>` schema identity
- **AND** 对应 change MUST 说明旧 major 的兼容期限或迁移路径

### Requirement: JSON schema coverage 必须由自动验证保护
Buildr 产品验证 MUST 枚举所有受支持 `--json` 命令，校验 schema identity、有效 JSON、关键既有字段和 checkout/npm parity，并 MUST 在新增 JSON surface 未登记时失败。

#### Scenario: 新增 JSON 命令未登记
- **WHEN** command registry 新增或启用一个 `--json` 输出但 schema registry/coverage 未包含该命令
- **THEN** 产品验证 MUST 失败并报告缺失命令

#### Scenario: schema identity 漂移
- **WHEN** 同一命令的 checkout 与 tarball 输出使用不同 `schemaVersion`
- **THEN** parity verification MUST 失败并报告两个 identity

### Requirement: CLI version JSON 必须声明稳定 identity
Buildr CLI MUST 为 `buildr version --json` 输出登记的公开 version payload，且不得向该输出混入文本说明。

#### Scenario: Agent 查询 CLI version
- **WHEN** Agent 运行 `buildr version --json`
- **THEN** stdout MUST 是单一有效 JSON 对象
- **AND** 顶层 `schemaVersion` MUST 为 `buildr.version/v1`
- **AND** payload MUST 至少包含非空 package name 与 semver version

### Requirement: CLI 路由错误必须提供机器可读 envelope
Buildr CLI MUST 在无法匹配命令且输入请求 `--json` 时输出登记的公开 error payload，并保持失败退出语义。

#### Scenario: 未知命令请求 JSON
- **WHEN** Agent 运行 `buildr <unknown-command> --json`
- **THEN** stdout MUST 是单一有效 JSON 对象且 stderr MUST 为空
- **AND** 顶层 `schemaVersion` MUST 为 `buildr.cli-error/v1`
- **AND** payload MUST 包含稳定 error code、未知输入、canonical suggestions 和根帮助提示
- **AND** 命令 MUST 以 2 退出

#### Scenario: checkout 与 tarball 错误一致
- **WHEN** 产品验证对 checkout 和 npm tarball CLI 运行相同未知 JSON 命令
- **THEN** 两者 MUST 使用相同 schema identity、error code 和字段类型
- **AND** schema coverage registry MUST 在任一新 JSON family 未登记时失败

### Requirement: Task Record CLI 必须提供稳定公开 JSON identity
`buildr task create|inspect|update|complete|abandon --json` MUST返回 `buildr.task-record-result/v2` 顶层 identity，并 MUST至少包含 operation、status、taskId、record、`recordDigest: string|null`、diagnostic、effects 与 nextActions；checkout 和 npm tarball CLI MUST保持 schema parity。v2 MUST删除 canonical path，且 MUST NOT暴露 database path、table、row id、SQL 或 storage internals。非空 `recordDigest` 是 current normalized logical record 的响应级 evidence，不属于持久 Task Record schema；记录不存在或无法形成有效 read model 时为 `null`。

#### Scenario: Task Record 操作成功
- **WHEN** 五个 action 中任一成功并请求 JSON
- **THEN** stdout MUST是单一有效 `buildr.task-record-result/v2` 对象且 stderr 为空
- **AND** payload MUST返回实际 operation、created/inspected/updated/completed/abandoned status、当前 record、匹配其规范化逻辑内容的 `recordDigest` 与精确 effects

#### Scenario: Task Record 业务冲突
- **WHEN** action 因重复 identity、state conflict、无效引用、database/schema failure 或 canonical root 证明失败而 blocked
- **THEN** stdout MUST仍返回 `buildr.task-record-result/v2` blocked 对象并以非零状态退出
- **AND** payload MUST包含稳定 error code、未发生 effects、可用 Task identity、可证明时的当前 `recordDigest` 与唯一 next action

#### Scenario: Task Record 命令语法错误
- **WHEN** 调用缺少 task-id、required title/intent/summary/reason，update 没有 mutation flag，或包含未知/冲突参数
- **THEN** CLI MUST使用登记的 `buildr.cli-error/v1` envelope 和对应 Task Manager help topic
- **AND** MUST NOT输出部分 Task Record result 或混入人类可读文本

#### Scenario: JSON 暴露暂缓字段
- **WHEN** Task Record result 包含 canonical path、database path、table、row id、SQL、revision、workspaceId、storage/publication classification、Environment identity 或专业 record reference
- **THEN** public schema verification MUST失败
- **AND** 顶层 `recordDigest` MUST NOT被解释或渲染为数据库字段，checkout/npm parity MUST NOT以两端同时漂移为通过

#### Scenario: JSON coverage 未登记新 action
- **WHEN** command registry 已启用任一 Task Record JSON action，但 v2 public schema registry、关键字段检查或 checkout/npm parity 没有覆盖
- **THEN** 产品验证 MUST失败并报告遗漏的 command/schema family
- **AND** MUST NOT保留 v1 alias 或按运行时存储选择不同 schema

### Requirement: Git worktree provider CLI 必须使用窄公开 JSON identity
`buildr worktree create|inspect|cleanup --json` MUST 返回 `buildr.git-worktree-result/v1` 顶层 identity，并 MUST 至少包含 operation、status、taskId、repository plan/evidence、Git effects、diagnostic 与 nextActions。payload MUST 只表达 repository、checkout、branch、HEAD、remote、clean、registration 与本地 Git cleanup 事实；checkout 和 npm tarball CLI MUST 保持 schema parity。

#### Scenario: Git provider 操作成功
- **WHEN** `worktree create|inspect|cleanup` 中任一成功并请求 JSON
- **THEN** stdout MUST 是单一有效 `buildr.git-worktree-result/v1` 对象且 stderr 为空
- **AND** 每个 repository MUST 返回真实 Git identity/effects，不得返回 Environment ready、Runtime/CLI/依赖、projection、资源、session 或总 cleanup 结论

#### Scenario: 旧 environment-shaped JSON 字段仍存在
- **WHEN** worktree public result、schema fixture 或 checkout/npm parity 包含 `environmentRoot` 总结、`executionReady`、runtime expectation、CLI invocation、adoption/session 或 Environment cleanup status
- **THEN** public schema verification MUST 失败
- **AND** MUST NOT 通过保留旧 schema major 或兼容 alias 继续暴露这些字段

#### Scenario: Git provider JSON coverage 不完整
- **WHEN** 任一保留的 worktree action 没有登记 `buildr.git-worktree-result/v1`、关键字段检查或 checkout/npm parity
- **THEN** 产品验证 MUST 失败并报告遗漏 action
- **AND** `worktree context|adopt` MUST NOT 出现在 command/schema registry

### Requirement: Task Review CLI 必须提供稳定 operation JSON identity
`task review inspect|record` MUST输出closed `buildr.task-review-operation-result/v2`，每个slot包含v2 Result、`resultDigest`与`observedAt`，MUST不包含applicability、Development或Terminal facts。record冲突 MUST返回当前slot与稳定diagnostic且effects为空。

#### Scenario: CAS冲突JSON
- **WHEN** record提交陈旧expectedCurrentDigest
- **THEN** CLI MUST返回v2 blocked operation result和current digest
- **AND** MUST不覆盖current Result

#### Scenario: JSON inspect 成功
- **WHEN** 用户以`--json`检查存在或缺失的Review slots
- **THEN** MUST返回closed v2 operation envelope和两个slot

#### Scenario: JSON record blocked
- **WHEN** record输入不完整、Task terminal或CAS冲突
- **THEN** MUST返回v2 blocked envelope、diagnostic、current slots与零effects

#### Scenario: response-only digest
- **WHEN** inspect或record返回已有Result
- **THEN** `resultDigest` MUST由规范Result序列化计算且不写入Result或数据库revision列

### Requirement: Task Review JSON registry 必须与 command registry 同步
Public JSON registry、CLI command registry、help、schema validation 与 checkout/npm parity MUST 对 Task Review 两个 actions 保持一致；任一 action 可达但 operation schema/关键字段测试缺失时，package verification MUST fail closed。

#### Scenario: registry 漂移
- **WHEN** `task review inspect|record` 任一 command 已登记，但 public JSON family、关键字段 guard 或 parity fixture 缺失
- **THEN** static/package verification MUST 失败并指出缺失 identity

### Requirement: Task Verification CLI 必须提供稳定 operation JSON identity
`task verification inspect|record --json` MUST 输出 `buildr.task-verification-operation-result/v1`，包含 operation、`inspected|recorded|blocked` status、Task ID、单一 result slot、diagnostic、effects 与 nextActions。Result digest 与 applicability MUST 位于 read model envelope，不得写入 persisted Result。

#### Scenario: inspect 空 slot
- **WHEN** Task 没有 current Verification Result
- **THEN** payload MUST 返回 `present: false`、null Result/digest/applicability 与零 effects

#### Scenario: record blocked
- **WHEN** Application 拒绝 input、Task terminal、declaration invalid 或 persistence 失败
- **THEN** payload MUST 返回 blocked、具体 diagnostic 与零 effects
- **AND** stdout MUST 不混入普通日志

### Requirement: Task JSON 必须稳定表达 Parent 与直接 Children
Task Record operation JSON MUST在record中返回nullable `parentTaskId`与显式`isParent`，并在独立`taskRelations`查询投影中返回排序后的直接Children摘要。`childTaskIds`、Child数量、数据库row、SQL、路径、祖先闭包或递归Task正文 MUST不进入Task Record schema。

#### Scenario: 独立 Task JSON
- **WHEN** create、inspect或list返回没有Parent和Children的Task
- **THEN** record MUST包含`parentTaskId: null`
- **AND** `taskRelations.children` MUST为空

#### Scenario: Parent 与 Child JSON
- **WHEN** inspect返回存在直接层级关系的Task
- **THEN** Child record MUST返回直接`parentTaskId`，Parent view MUST在`taskRelations.children`返回排序摘要
- **AND** MUST不返回`childTaskIds`或递归record

#### Scenario: 旧 JSON consumer
- **WHEN** consumer仍要求record内`childTaskIds`或旧schema shape
- **THEN** 当前closed schema MUST拒绝该字段
- **AND** consumer MUST迁移到`taskRelations.children`

### Requirement: Parent coordination JSON 必须closed且登记
Buildr MUST只登记`buildr.parent-coordination-result/v4`的closed inspect响应；响应 MUST包含Task ID、record digest、`parent|child|ordinary` mode、Parent状态、目标、结果、Parent来源、直接Children、完成观察、可选旧计划历史、局部诊断与零effects。

#### Scenario: inspect public JSON
- **WHEN** client请求Parent coordination read model
- **THEN** response MUST通过closed专业HTTP Schema并使用生成DTO
- **AND** MUST不包含Contribution、Handoff、Development、Review、Verification、交付或环境字段

### Requirement: legacy absence 必须是明确contract
旧Parent Plan不存在 MUST以`historicalPlan: null`表达；存在时只作为历史内容返回。它 MUST不改变当前`mode`、`isParent`、完成观察或Task状态。

#### Scenario: 只有旧Parent Plan
- **WHEN**普通Task仅保存`legacy_parent_plan_json`
- **THEN** Parent coordination MUST保持ordinary或child当前身份
- **AND** MUST不要求父任务完成授权

#### Scenario: 旧Task JSON
- **WHEN**历史Task没有旧Parent Plan或Contribution Handoff
- **THEN** 当前响应 MUST使用`historicalPlan: null`和真实Task关系
- **AND** MUST不回填或读取Handoff

### Requirement: Buildr Web 术语迁移不得机械重命名已发布 JSON identity
Buildr MUST 将公开帮助、文档和用户可见字段说明迁移为 Buildr Web，但 MUST 保留本次任务前已经发布并参与兼容读取的 JSON schema id、protocol identity 与 closed payload field。只有独立规范证明用户价值、版本迁移与兼容读取时，未来 Change 才能修改这些 identity。

#### Scenario: 验证 JSON schema registry
- **WHEN** verifier 比较术语迁移前后的 public JSON registry 与代表性 launcher/instance/preview payload
- **THEN** 既有 `buildr.local-app-*`、`buildr.launcher-*` 或等价已发布 identity MUST 保持可读且未被机械改名
- **AND** CLI/help/docs 中的产品名称和 canonical command MUST 使用 Buildr Web 与 `buildr web`

#### Scenario: 内部 identity 不形成 legacy command
- **WHEN** internal schema、环境变量、SQLite 或目录仍保留 `app` / `local-app` compatibility identity
- **THEN** CLI executable catalog、help topics、suggestions 与 Launcher command MUST NOT 因此重新暴露 `buildr app`

### Requirement: npm 应用负载 manifest 必须使用稳定公共 JSON identity
Application payload manifest MUST 使用稳定 schema identity，并 MUST 表达 package/version、protocol identity、source commit、runtime/worker/resource inventory、每项 size/SHA-256 和唯一 payload digest。Manifest MUST 只描述 npm package 共享业务负载，不得包含 Product Node、SEA、installer、签名或本机 Launcher target。

#### Scenario: 验证 payload manifest
- **WHEN** npm pack 或 runtime 读取 application payload manifest
- **THEN** reader MUST 验证 closed schema、排序 inventory、逐文件摘要与总 digest
- **AND** 未知字段、绝对路径、平台 envelope 或资源漂移 MUST fail closed

### Requirement: npm release artifact manifest 必须使用稳定公共 JSON identity
npm release artifact manifest MUST 使用稳定 schema identity，并 MUST 表达 package/version、filename、size、SHA-256、SHA-512 integrity、payload digest、protocol、source commit、Host Node engines 与 inventory。当前 MUST NOT 生成或登记 platform release manifest/checksums schema。

#### Scenario: 验证 npm release artifact
- **WHEN** workflow 在 smoke、publish 或 Registry readback 前读取 release artifact manifest
- **THEN** reader MUST 逐字节核对唯一 tarball 的 filename、size、SHA-256、integrity 与 payload digest
- **AND** manifest 出现 platform target、Product Node、installer 或签名字段时 MUST 失败

### Requirement: npm installation、Launcher 与运行状态必须使用稳定公共 JSON identity
Installation origin、installation registry、Launcher binding、installation status、Doctor、CLI version 与 Web health MUST 使用 closed schema 表达 npm、development 和当前 instance identity。npm Launcher binding MUST 包含 ownership、Host Node、package entry、prefix、protocol/payload 与 target；当前 enum MUST NOT 声称 platform installation 或 Product Node 可用。

#### Scenario: npm installation 与 Launcher status
- **WHEN** Agent 请求 installation 或 launcher status JSON
- **THEN** 输出 MUST 分别展示 formal npm installation、Launcher binding、development 与当前 instance 的 closed identity、状态和 next actions
- **AND** MUST NOT包含 secret、完整环境变量、PATH 推断或不存在的 platform channel

#### Scenario: binding 漂移
- **WHEN** Host Node、entry、prefix、origin、payload 或 ownership 任一不匹配
- **THEN** JSON MUST 将 Launcher 标为 stale/invalid，列出稳定 reason code 与 repair action
- **AND** MUST NOT把可执行成功或版本相同解释为 identity current

### Requirement: Buildr update 双轨道 JSON 必须使用 v2 identity
`buildr update check --json` MUST输出 `buildr.update-check/v2`，`buildr update --json` MUST输出 `buildr.update/v2`；两者 MUST用 closed 双轨道结构替代 v1 单一 `available.version` 语义。

#### Scenario: Agent 检查双轨道更新
- **WHEN** Agent 运行 `buildr update check --json`
- **THEN** payload MUST包含 `current`、`selectedTrack`、`tracks.stable`、`tracks.candidate`、`notices`、`observedAt`、`freshness`、`blockingReasons` 与 `nextActions`
- **AND** 每个轨道 MUST包含 `tag`、`version`、`status`、`available` 与 `installable`

#### Scenario: Agent 执行指定轨道更新
- **WHEN** Agent 运行 `buildr update --track <track> --json`
- **THEN** payload MUST使用 `buildr.update/v2` 并明确 selectedTrack、精确目标版本、执行状态与副作用

#### Scenario: v1 consumer 迁移
- **WHEN** consumer 仍只理解 `buildr.update-check/v1` 或 `buildr.update/v1`
- **THEN** consumer MUST升级为读取 v2 tracks
- **AND** Buildr MUST NOT在 v1 identity 下改变 `available.version` 的既有语义

### Requirement: Doctor Release Awareness JSON 必须保持非诊断投影
`buildr.doctor/v1` MAY additive增加 `releaseAwareness` 与 `notices`，但这些字段 MUST不改变既有 `findings`、`repairPlan`、`nextSteps`、`ok` 与 `health` 的语义。

#### Scenario: Doctor 返回版本通知
- **WHEN** Doctor JSON包含 releaseAwareness
- **THEN** schema coverage MUST证明 compact/full 都返回合法结构
- **AND** Registry失败 fixture MUST证明既有 health 字段保持不变

### Requirement: 每日演进 JSON 必须声明稳定 schema identity
Buildr 每日演进 CLI 与本机 HTTP 的 `--json` / JSON 响应 MUST 在顶层声明非空 `schemaVersion`，并为 record、inspect、list 与 Web 读取使用稳定 `buildr.<payload>/v<major>` identity。同一 major 内 MUST 只做兼容扩展。payload MUST 包含 Project、日期、日摘要四问、提交（作者、`authorship`、可选 Task 关联）、变更文件与未解析 Task 引用；MUST NOT 暴露本机绝对路径、SQLite 路径或 Git working tree path。Task 关联计数 MAY 为 0。

#### Scenario: Agent 读取 record JSON
- **WHEN** Agent 成功执行每日演进 `record --json`
- **THEN** 输出 MUST 是单一 JSON 对象并包含匹配的 `schemaVersion`
- **AND** MUST 报告 Project、日期、提交计数和 Task 关联计数

#### Scenario: inspect 包含未解析 Task
- **WHEN** 已保存文件引用的 Task 在读取时已不存在
- **THEN** JSON MUST 将该引用标为未解析
- **AND** MUST NOT 删除文件中的 Task ID

### Requirement: 公共 JSON identity 与 envelope 必须有唯一技术 owner
Buildr MUST 将当前公共 JSON schema identity registry 与 envelope helper 归入 Infrastructure Contracts 的唯一生产 owner；所有现有调用者 MUST复用该 owner，且本次结构迁移 MUST NOT改变任何已登记 identity、payload 字段、stdout/stderr 或退出行为。

#### Scenario: 模块生成既有公开 JSON
- **WHEN** 任一 CLI、Task、Workspace、System、Verification 或 Agent Assets 模块生成已有 public JSON family
- **THEN** 模块 MUST从 Infrastructure Contracts 取得相同 schema identity 与 envelope helper
- **AND** 输出 MUST与迁移前的 schemaVersion、payload 和退出语义等价

#### Scenario: 检查旧全局 Application helper
- **WHEN** 架构验证扫描 Buildr Service 生产源码
- **THEN** `src/application/json-contracts.mjs` MUST不存在
- **AND** 生产代码与验证清单 MUST不再引用该旧路径

#### Scenario: 后续 contract system 保持排除
- **WHEN** 本 Change 完成
- **THEN** Buildr MUST NOT因本次迁移引入完整 JSON Schema、Ajv、DTO 自动生成或 typed client

### Requirement: Publication platform 必须新写入 Buildr Web 并兼容读取旧值
publication platform 的 canonical writer MUST 写入 `buildr-web`；reader MUST 接受 `buildr-web` 与历史 `local-app` 并将两者投影为 Buildr Web。未知值 MUST fail closed。

#### Scenario: 读取历史 publication
- **WHEN** reader 收到 platform 值 `local-app`
- **THEN** reader MUST 成功解析并向用户展示 Buildr Web

#### Scenario: 写入当前 publication
- **WHEN** Buildr 生成或更新 publication target
- **THEN** payload MUST 使用 `buildr-web`
- **AND** 不得生成新的 `local-app` canonical payload

#### Scenario: 拒绝未知 platform
- **WHEN** reader 收到未登记的 platform 值
- **THEN** 解析 MUST fail closed 并返回稳定诊断

### Requirement: 长流程 compact summary 必须登记并受自动覆盖保护
Buildr MUST在公共JSON registry、CLI help、schema validation与checkout/npm parity中登记`buildr.long-running-operation-summary/v1`，并保护self-bootstrap、formal Verification与release transaction的compact/full边界。Registry MUST不再包含Retrospective list或operation result。

#### Scenario: compact schema 漂移
- **WHEN** 长流程缺少summary schema或关键边界
- **THEN** Product verification MUST失败

#### Scenario: compact 泄漏完整专业事实
- **WHEN** compact payload泄漏完整证据、日志、路径或secret
- **THEN** schema verification MUST失败

#### Scenario: explicit full保持owner identity
- **WHEN** 调用方显式请求full
- **THEN** CLI MUST返回owner既有full schema
- **AND** MUST不写入新的durable Result

### Requirement: Public JSON registry不得包含退役任务研发与旧收尾schema

Public JSON registry MUST不包含Task Development、旧Task Finish、Task Environment、Environment Plan/Receipt或其他已退役任务流程schema。删除项不得保留兼容alias、example或parity检查。

#### Scenario: fresh build检查JSON catalog
- **WHEN** package/static validation读取公共schema registry
- **THEN** registry MUST只包含仍有公共消费者的Task Record、Review、Verification、Parent、Worktree及其他当前schema

### Requirement: Parent启动就绪与refresh结果必须保持独立公开JSON identity
Buildr MUST为Parent启动就绪投影和planning refresh operation登记closed public JSON shape，并在Application、CLI、schema registry与checkout/npm parity中保持一致；payload MUST不暴露Review正文、SQLite locator或本机绝对路径。

#### Scenario: 读取Parent planning refresh结果
- **WHEN** caller请求公开JSON
- **THEN** payload MUST只包含Parent Coordination owner允许的事实
- **AND** MUST不包含研发回执或旧收尾字段

### Requirement: Task Verification record 冲突必须使用稳定公开 JSON
`buildr task verification record --json` MUST要求调用方提供最近一次 `inspect` 观察到的 `absent|reportDigest`。摘要不匹配时，CLI MUST返回同一 Task Verification operation result family、稳定 conflict diagnostic 与最新 `currentReportDigest`，并 MUST保持 current 报告不变。

#### Scenario: 两个调用方基于同一摘要写入
- **WHEN** 第一个调用方写入成功后第二个调用方提交相同旧摘要
- **THEN** 第二个 JSON 结果 MUST为 blocked 并包含最新 `currentReportDigest`
- **AND** current Verification Report MUST仍是第一个调用方写入的内容

### Requirement: Task Record JSON 必须局部表达引用可用性
Task Record inspect、detail 和 list JSON MUST始终返回结构有效的 Task Record，并以响应级 `referenceDiagnostics` 局部表达当前 Project、Service 或 Change 不可用。诊断 MUST包含 Task 与引用 identity，MUST不写回 Task Record，也不得形成统一健康状态。

#### Scenario: 历史引用不可用
- **WHEN** Task Record 内一个 Project、Service 或 Change 当前不存在、已迁移或暂时不可解析
- **THEN** CLI 与 Buildr Web JSON MUST返回完整顶层 Task Record 和对应局部诊断
- **AND** 其他引用、Parent/Child、状态与结果 MUST保持可读
