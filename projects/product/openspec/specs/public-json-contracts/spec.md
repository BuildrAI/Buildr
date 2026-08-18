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

### Requirement: Verification run 必须提供稳定公开 JSON identity
`buildr verification run --json` MUST 输出`buildr.verification-execution/v1`，并 MUST在成功、capability failure、formal execution record backpressure/seal failure与调用前invalid request路径保持单一stdout JSON object。Payload MUST区分transient execution status、Project/declaration identity、requested target identity、实际checks、精确capability/resource authorization、真实timing、target stability、Environment execution context与evidence lifecycle；并 MUST以additive `executionRecord` summary表达`not-applicable|not-opened|retained|blocked|attention`、portable record identity/outcome/lifecycle/body summary、transient cleanup、diagnostic与next action。Payload MUST NOT包含Workspace Node字段，不得暴露SQLite/database、正文locator、本机持久化路径，也 MUST NOT声称current Result、Candidate completeness、Result adoption或required assurance。

#### Scenario: 验证成功输出 JSON
- **WHEN** 所有显式command capabilities完成且target observation保持稳定
- **THEN** Task外JSON MUST返回`status: passed`、checks、declaration、duration、transient evidence reference与`executionRecord.status: not-applicable`
- **AND** formal Task JSON只有在execution record retained且transient cleanup得到明确处置后才能返回`status: passed`与portable record summary

#### Scenario: 验证业务失败输出 JSON
- **WHEN** capability执行失败、资源等待失败、target drift、execution context在启动后失稳或formal record无法安全retained
- **THEN** stdout MUST仍返回同一`buildr.verification-execution/v1` family的失败摘要并以非零状态退出
- **AND** payload MUST包含已完成checks、具体failures、execution record/transient cleanup状态和可用结构化诊断，且 MUST NOT写current Result

#### Scenario: formal record backpressure
- **WHEN** execution record quota reservation在producer启动前被拒绝
- **THEN** JSON MUST返回`status: failed`、空checks与`executionRecord.status: blocked`
- **AND** MUST提供portable diagnostic与唯一next action，不得暴露quota SQL或数据库路径

#### Scenario: invalid request
- **WHEN** 参数、v2 declaration、capability identity、invocation kind、执行根或授权不合法
- **THEN** JSON MUST返回`status: failed`、空checks与`executionRecord.status: not-opened`
- **AND** MUST不生成execution record、transient evidence、current Result或误报completed execution

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

### Requirement: Task Environment CLI 必须提供稳定公开 JSON identity
`task environment prepare|inspect|cleanup --json` MUST返回`buildr.task-environment-result/v3`；Plan `record|inspect --json` MUST返回`buildr.task-environment-plan-result/v1`。Environment result MUST包含operation、status、taskId、SQLite current locator、observedAt、sanitized read model、Plan identity、逐Service/Step facts、diagnostic、effects与nextActions，并 MUST不暴露SQLite path、resource handle、凭证或完整命令输出。

#### Scenario: Environment 操作成功
- **WHEN** action成功并请求JSON
- **THEN** stdout MUST是单一匹配schema对象且stderr为空
- **AND** payload MUST返回实际operation、status、观察时间、locator、read model与精确effects

#### Scenario: Environment 业务阻塞
- **WHEN** action因plan-missing/invalid、scope、identity/drift、Step failure、provider、Runtime/CLI、projection、resource或cleanup authorization blocked
- **THEN** stdout MUST返回v3 blocked对象并以非零状态退出
- **AND** payload MUST包含稳定code、具体Service/Step、已发生effects与next action

#### Scenario: Inspect 尚无 Environment Receipt
- **WHEN** 有效Task尚无current且执行inspect
- **THEN** payload MUST返回只读unavailable、空read model与prepare next action
- **AND** MUST不创建row或伪造Plan/effect

#### Scenario: JSON 暴露敏感或越权字段
- **WHEN** result包含secret、环境变量值、完整stdout/stderr、任意shell、resource handle、provider receipt、Agent session或SQLite path
- **THEN** public schema verification MUST失败
- **AND** checkout/npm parity同时漂移 MUST不视为通过

#### Scenario: JSON coverage 未登记 Environment action
- **WHEN** public command registry启用Plan或Environment action但schema/parity未覆盖
- **THEN** package verification MUST失败并指出遗漏family
- **AND** 内部resource/saved-current actions MUST不进入public registry

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
`buildr task review inspect|record --json` MUST 返回 `buildr.task-review-operation-result/v1` 顶层 identity，并 MUST 至少包含 operation、`status: inspected|recorded|blocked`、taskId、`slots.planning`、`slots.completion`、diagnostic、effects 与 nextActions。每个 slot MUST 包含 deterministic path、present、`result|null`、`resultDigest|null` 与 `applicability: current|stale|unknown|null`。

#### Scenario: JSON inspect 成功
- **WHEN** CLI 从 checkout 或 npm tarball 执行成功的 Task Review inspect
- **THEN** stdout MUST 是单一有效 operation result 且 stderr 为空
- **AND** 两种发行形态 MUST 保持 schema、字段与退出语义 parity

#### Scenario: JSON record blocked
- **WHEN** target identity 缺失、Task terminal、Result schema 无效或原子写入失败
- **THEN** stdout MUST 仍返回同一 schema 的 blocked object 并以非零状态退出
- **AND** effects MUST 不声称 canonical Result 已改变

#### Scenario: response-only digest
- **WHEN** 任一 slot 存在有效 Result
- **THEN** resultDigest MUST 是 canonical Result bytes 的响应级 identity
- **AND** Result object MUST 不包含 resultDigest、revision、current 或 applicability

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

### Requirement: Verification JSON registry 必须与 command registry 同步
公开 schema registry、CLI registry、help/architecture verification 与 npm package parity MUST 同时登记 `verificationExecution`、`verificationEvidenceCleanup` 和 `taskVerificationOperationResult`，并 MUST 删除旧 `verificationRun` schema key 与 `buildr.verification-run/v1` identity。

#### Scenario: 枚举公开 JSON families
- **WHEN** product tests 枚举 `PUBLIC_JSON_SCHEMAS`
- **THEN** registry MUST 精确包含三个当前 Verification families
- **AND** checkout 与 installed CLI MUST 输出相同 schema identities

### Requirement: Task JSON 必须稳定表达 Parent 与直接 Children
Task Record operation JSON MUST 使用新的 major schema identity，并 MUST 在 record 中明确返回 nullable `parentTaskId` 与排序后的 `childTaskIds`。该 read model MUST NOT 暴露数据库 row id、SQL、路径、祖先闭包或递归 Task 正文。

#### Scenario: 独立 Task JSON
- **WHEN** create/inspect/list 返回没有 Parent 和 Children 的 Task
- **THEN** record MUST 包含 `parentTaskId: null` 与空 `childTaskIds`
- **AND** schema registry MUST 验证字段和 major identity

#### Scenario: Parent 与 Child JSON
- **WHEN** inspect 返回存在直接层级关系的 Task
- **THEN** Child MUST 返回直接 `parentTaskId`，Parent MUST 返回排序后的直接 `childTaskIds`
- **AND** MUST NOT 递归嵌入关联 Task record

#### Scenario: 旧 JSON consumer
- **WHEN** 新字段改变 closed Task Record shape
- **THEN** 产品 MUST 提升公开 Task operation schema major
- **AND** docs、registry 与 contract tests MUST 同步更新

### Requirement: Parent coordination JSON 必须closed且登记
Buildr MUST登记Parent Plan、Contribution binding、Contribution Handoff、coordination inspect/mutation Result的stable public JSON identities；响应 MUST不暴露SQLite path或本机绝对路径。

#### Scenario: inspect public JSON
- **WHEN** client请求Parent coordination read model
- **THEN** response MUST包含schemaVersion、Parent Plan identity、Child/Contribution facts、prerequisites、diagnostics与零effects
- **AND** public registry MUST拒绝未登记或开放payload字段

### Requirement: legacy absence 必须是明确contract
没有Parent Plan或Contribution Handoff MUST以closed absent/legacy状态表达，不得用缺字段异常、filesystem fallback或自动upgrade掩盖。

#### Scenario: 旧Task JSON
- **WHEN** inspect读取旧Task/Receipt
- **THEN** response MUST返回legacy mode与可操作diagnostic
- **AND** MUST保持原Task read model兼容

### Requirement: Task Finish run 必须提供 portable execution record operation summary
`buildr task finish run|inspect --json` MUST按`--detail compact|full`返回不同且稳定的公开JSON投影。缺省或显式`--detail compact` MUST继续返回closed `buildr.task-finish-compact-result/v1`；显式`--detail full` MUST返回canonical `buildr.task-finish-result/v3`。v3 MUST以排序的Environment repository set及repository-scoped contribution、carrier、equivalence、delivery与cleanup state作为多仓库authority，并提供repository set、carrier set与delivery set identity；顶层单值carrier、target与delivery只能投影当前failure repository、适用Workspace repository或唯一有贡献repository，MUST NOT伪装跨repository聚合事实。compact MUST保持既有closed字段集合和语义，不新增repository数组、absolute path、lease或恢复token之外的内部owner事实。

旧`buildr.task-finish-result/v2` MUST继续支持有界读取和compact投影，但新run MUST只写v3。compact与full均 MUST NOT把Execution Record、repository set identity或兼容单值投影视为新的Finish current、delivery、Task terminal或Result adoption authority。

#### Scenario: 显式 full 输出
- **WHEN** Agent执行`task finish run|inspect --detail full --json`读取新repository-set run
- **THEN** CLI MUST返回`buildr.task-finish-result/v3`及排序的repository-scoped states和set identities
- **AND** 多个有贡献repository时 MUST不以顶层单值carrier或delivery伪装完整集合

#### Scenario: 缺省 compact 输出
- **WHEN** 同一v3 Result以缺省或显式`--detail compact`读取
- **THEN** CLI MUST继续返回closed `buildr.task-finish-compact-result/v1`与`detail: compact`
- **AND** MUST不暴露repository数组、本机locator或SQLite/lease内部事实

#### Scenario: 旧 v2 Result 有界读取
- **WHEN** inspect读取合法的旧`buildr.task-finish-result/v2`
- **THEN** Product MUST保持既有full事实可读并可生成兼容compact投影
- **AND** MUST不把旧singleton事实猜测扩展为多repository delivery

#### Scenario: Finish invocation retained
- **WHEN** 一次实际执行的Finish invocation已terminal seal且record retained
- **THEN** run compact JSON MUST返回portable record ID、outcome、lifecycle、body digest/size/truncated与diagnostics cleanup disposition
- **AND** 顶层Finish status、failure、resume与repository delivery facts MUST继续由`task_finish_current`决定

#### Scenario: record open backpressure
- **WHEN** record quota reservation在任何Finish execution side effect前被拒绝
- **THEN** run compact JSON MUST返回blocked execution record summary、portable diagnostic与唯一cleanup/resolution next action
- **AND** MUST不返回伪Finish run、phase、Carrier、delivery mutation或terminal completion

#### Scenario: Finish完成后record attention
- **WHEN** Finish owner已形成complete terminal truth但record seal、post-read或diagnostics cleanup无法完整确认
- **THEN** compact与full JSON MUST保持`status: complete`并返回`executionRecord.status: attention`
- **AND** MUST明确保留或已retained的evidence disposition，不得要求重跑Finish或暴露本机恢复locator

#### Scenario: invalid或no-op invocation
- **WHEN** request在open前无效，或既有Finish已经complete且run只返回幂等no-op
- **THEN** 有效Finish payload MUST返回`executionRecord.status: not-opened`与零record effect
- **AND** MUST不创建execution record、diagnostics transient或改变既有Finish facts

#### Scenario: 非法 detail
- **WHEN** 调用方提供`--detail`且值不是`compact|full`
- **THEN** CLI MUST在任何Finish读取或执行副作用前返回`buildr.cli-error/v1`
- **AND** MUST提供稳定错误code与对应Task Finish help

#### Scenario: 入口聚合缺口的 CLI 错误
- **WHEN** `task finish run --json`在创建run前同时观察到环境与研发入口缺口
- **THEN** CLI MUST输出`buildr.cli-error/v1`且`error.details.gaps`同时包含非空的`environment`与`development`
- **AND** MUST NOT输出compact或full Finish run payload

### Requirement: Task Execution Record 查询必须提供稳定 portable JSON
Buildr MUST 为 Task-scoped execution record list、detail 与 body-file read 登记稳定 v1 public JSON identity。List MUST 表达 requested view 与 records；detail MUST 表达单条 portable record 和可用正文文件；body-file read MUST 表达 record/file identity、完整性 metadata、内容与截断状态。三类 payload MUST 使用 closed 字段白名单，且 MUST NOT 暴露 SQLite、database row、body locator、本机路径、resource token 或 mutation action。

#### Scenario: list 与 detail JSON
- **WHEN** Buildr Web HTTP 返回 execution record list 或 detail
- **THEN** payload MUST 分别使用已登记的 v1 schema identity
- **AND** 同一 record 在不同 view 中 MUST 保持相同 record identity 与 metadata 语义

#### Scenario: body-file JSON
- **WHEN** Buildr Web HTTP 成功读取 execution record 正文文件
- **THEN** payload MUST 返回 UTF-8 content、digest、stored size、stored truncation、response bytes 与 response truncation
- **AND** payload MUST NOT 返回 locator 或任何可用于读取其他文件的路径

#### Scenario: 无效或不可用正文
- **WHEN** filename 不受支持、record 不属于 Task、正文已 cleaned 或完整性校验失败
- **THEN** HTTP MUST 返回统一 diagnostic envelope 与准确 status
- **AND** MUST NOT 在错误 details 中泄漏正文 locator 或绝对路径

### Requirement: ExecRecord GC CLI 必须提供稳定公共 JSON
Buildr MUST 提供 `buildr task execution-record gc [--target <canonical-workspace>] [--dry-run] [--limit <1..500>] [--json]`。`--json` MUST使用登记的 ExecRecord GC schema，并 MUST直接投射同一次 Application result；CLI MUST NOT接受 Task/owner/path、retention override、force、failure disposition 或 cleanup shell 输入。

#### Scenario: headless dry-run
- **WHEN** automation 使用 `--dry-run --json` 调用 ExecRecord GC
- **THEN** CLI MUST返回 machine-readable stable schema、Workspace 级 counts 与 bounded selected actions
- **AND** MUST不执行 mutation或输出正文 locator、本机绝对路径和 SQLite 细节

#### Scenario: 手动执行 bounded GC
- **WHEN** caller 使用合法 limit 调用非 dry-run CLI
- **THEN** CLI MUST调用 Task Execution Record Application 完成同一 bounded GC operation
- **AND** 非 JSON 输出 MUST只给出简洁计数摘要，不改变 Application authority

#### Scenario: 非法策略输入
- **WHEN** caller 提供越界 limit、force、owner、path 或 retention override
- **THEN** CLI MUST在 GC mutation 前拒绝请求并返回稳定 input diagnostic
- **AND** MUST NOT创建第二策略或绕过固定 retention

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

### Requirement: Execution record CLI readback 必须提供closed portable JSON
Buildr MUST为Task execution record CLI list与inspect登记稳定public JSON schema identity。List payload MUST包含Task、requested view、observedAt与有界records；inspect payload MUST包含matching portable record、可选compact Verification summary、available body filenames、diagnostic与next actions。两类payload MUST复用Task Execution Record Application值语义，MUST不暴露SQLite、body locator、本机路径、raw command、resource token或mutation action。

#### Scenario: list JSON
- **WHEN** Agent使用`task execution-record list --json`
- **THEN** stdout MUST为单一closed JSON object并返回稳定排序records
- **AND** open与terminal record MUST保持各自真实lifecycle/outcome，不推断Result采用状态

#### Scenario: inspect JSON
- **WHEN** Agent使用matching Task/record调用`task execution-record inspect --json`
- **THEN** stdout MUST为单一closed JSON object并返回portable compact facts与正文文件名
- **AND** open record没有正文时 MUST明确返回summary unavailable而不是伪造terminal facts

### Requirement: Verification active duplicate 必须返回非执行JSON结果
当`verification run --json`发现相同invocation identity的active record且未提供`--retry`时，Buildr MUST返回同一`buildr.verification-execution/v1` family中的非执行结果，包含`status: active`、existing record/run/invocation identity、空checks、零duration执行事实与指向list/inspect的next actions。Payload MUST不声称existing execution已经passed/failed，也MUST不包含transient evidence locator或新record effect。

#### Scenario: 默认请求命中active execution
- **WHEN** matching active record已存在且caller未显式retry
- **THEN** JSON MUST返回existing portable identity与`executionRecord.status: active`
- **AND** checks MUST为空且不得创建新evidence、record或capability side effect

#### Scenario: 显式retry正常执行
- **WHEN** caller提供`--retry`
- **THEN** JSON MUST按新run返回正常execution envelope与独立execution record summary
- **AND** payload MUST不覆盖或内联旧active execution结果

### Requirement: Task Finish compact schema 必须由自动覆盖保护
Buildr MUST在public JSON registry、CLI help、schema coverage与checkout/npm parity中登记`buildr.task-finish-compact-result/v1`。compact字段白名单、关键恢复字段与禁止字段 MUST由自动测试保护；新增full Result字段 MUST NOT未经显式契约更新自动进入compact。

#### Scenario: compact registry 漂移
- **WHEN** Task Finish compact CLI可达但schema registry、关键字段guard或checkout/npm parity任一缺失
- **THEN** Product verification MUST失败并报告缺失的compact family

#### Scenario: compact 泄漏完整诊断
- **WHEN** compact payload包含完整operations、checks、observations、stdout/stderr、diagnostics正文或本机locator
- **THEN** public JSON contract test MUST失败

### Requirement: Task Entry Snapshot CLI 必须提供稳定公开 JSON identity
`buildr task next <task-id> --json` MUST输出closed `buildr.task-entry-snapshot/v1`，至少包含operation、status、task、environment、development、blockers、`next`、diagnostic、effects，并 MAY包含显式请求的response-only profile。payload MUST不包含完整Receipt/Result、SQLite locator、resource handle、完整capability graph或隐藏Agent状态。

#### Scenario: compact snapshot 成功
- **WHEN** checkout或npm tarball CLI读取有效active Task
- **THEN** stdout MUST是单一有效JSON对象且stderr为空
- **AND** 两种发行形态 MUST保持schema、关键字段与退出语义parity

#### Scenario: snapshot blocked
- **WHEN** Task不存在或terminal、Environment/Development identity stale、execution target mismatch或capability route不可用
- **THEN** stdout MUST仍返回同一schema的blocked object并以非零状态退出
- **AND** effects MUST为空且diagnostic MUST包含精确code、owner与recovery action

#### Scenario: profile 未请求
- **WHEN** 调用方未提供`--profile`
- **THEN** payload MUST不包含profile
- **AND** 不得从其他持久化事实推断或回填历史性能数据

### Requirement: Task Entry Snapshot JSON registry 必须与 command registry 同步
Public JSON registry、command registry、help、schema guard与checkout/npm parity MUST同时登记Task Entry Snapshot；任一 surface 可达但coverage缺失时package/static verification MUST fail closed。

#### Scenario: registry 漂移
- **WHEN** `task next`已登记但`buildr.task-entry-snapshot/v1`、关键字段guard或parity fixture缺失
- **THEN** 产品验证 MUST失败并指出缺失identity

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

### Requirement: Execution Record recover 必须返回稳定公共 JSON
`buildr task execution-record recover --json` MUST返回 `buildr.task-execution-record-recover-result/v1` 单一 JSON object，包含 operation、status、Task/record identity、recovery mode、portable record、transient cleanup、diagnostic、effects 与 next actions。结果 MUST不包含 SQLite/database、body locator、canonical Workspace或临时绝对路径、正文、secret、raw command、resource token或任意用户自由文本。

#### Scenario: terminal evidence 恢复成功
- **WHEN** recover 使用合法 summary 成功 seal 原 record
- **THEN** JSON MUST返回 `status: recovered`、`mode: terminal-evidence` 与真实 terminal outcome/lifecycle
- **AND** effects MUST只描述原 record seal与 owned transient cleanup

#### Scenario: 需要用户授权
- **WHEN** terminal evidence 不可用且没有 unknown outcome 授权
- **THEN** JSON MUST返回 `status: authorization-required`、零 effects与稳定 diagnostic
- **AND** next actions MUST说明授权的精确影响且不得声称原 producer 已结束

#### Scenario: unknown 已授权处置
- **WHEN** unknown outcome 授权成功终结原 record
- **THEN** JSON MUST返回 `status: attention`、`mode: authorized-unknown` 与 `outcome: unknown`
- **AND** MUST明确该 record 不是 Verification Result且后续普通 invocation 可重新执行

### Requirement: Parent启动就绪与refresh结果必须登记公开JSON identity
Buildr MUST为Parent启动就绪投影和planning refresh operation登记closed public JSON shape，并在Application、CLI、schema registry、contract guard与checkout/npm parity中保持一致；payload MUST不暴露Review正文、完整Development Receipt、SQLite locator或本机绝对路径。

#### Scenario: Parent启动就绪JSON parity
- **WHEN** checkout与npm package读取同一Parent启动事实
- **THEN** 两者 MUST返回相同schema identity、status、checks、blockers、eligible Contributions与next语义
- **AND** effects MUST为空

#### Scenario: Parent refresh JSON parity
- **WHEN** checkout与npm package对满足条件的Parent执行planning refresh
- **THEN** 两者 MUST返回相同operation status、Plan/Review applicability、Development effect摘要与后续启动就绪语义
- **AND** 任一surface缺少registry或关键字段guard时package verification MUST失败

### Requirement: Task Finish 必须提供稳定的自举输入公开投影
`buildr task finish run|inspect --detail self-bootstrap --json` MUST 返回 `buildr.task-finish-self-bootstrap-input/v1`。该投影 MUST 由 Product 从当前及有界支持的旧 canonical Task Finish Result 归一化生成，且 MUST 使用稳定字段表达 Task/run/Workspace/target identity、Finish status/mode、self-bootstrap applicability、Workspace repository、排序的 repository carrier 集合、run-owned carrier container、activation paths、delivery refs、resume、Delivery Adaptation 与 cleanup facts；MUST NOT 要求消费者识别内部 `buildr.task-finish-result/v<major>` 结构。

#### Scenario: 当前多仓库 Result 形成稳定投影
- **WHEN** Agent 对 `buildr.task-finish-result/v3` current run 执行 `task finish inspect --detail self-bootstrap --json`
- **THEN** CLI MUST 返回 `buildr.task-finish-self-bootstrap-input/v1`
- **AND** payload MUST 唯一标识 Workspace repository、全部实际 repository carriers 及其共同 run container

#### Scenario: 旧单仓库 Result 形成相同契约
- **WHEN** Product 读取仍在有界兼容范围内的 `buildr.task-finish-result/v2`
- **THEN** projector MUST 把单 carrier 与 activation facts 归一化为同一个 self-bootstrap v1 模型
- **AND** runner 所需字段的名称、类型与语义 MUST 与 v3 投影一致

#### Scenario: resume 继续使用稳定投影
- **WHEN** Agent 以 matching resume token 执行 `task finish run --detail self-bootstrap --json`
- **THEN** 成功、blocked、target-race 或 Delivery Adaptation Result MUST 继续返回 self-bootstrap v1
- **AND** 调用方 MUST NOT切换到 full Result 才能决定下一动作

### Requirement: 自举输入版本必须独立于内部 Finish Result 演进
`buildr.task-finish-self-bootstrap-input/v1` 同 major 内 MUST 只做 additive 扩展，消费者 MUST 忽略未知字段并严格验证已知必需字段。内部 Task Finish Result 升级但 self-bootstrap 语义未变时 MUST 只扩展 Product projector；不兼容的 self-bootstrap 字段或语义变化 MUST 发布新的投影 major。未知投影 major 或无法完整归一化的内部 Result MUST 在任何 consumer effect 前 fail closed。

#### Scenario: 内部 Result 升级但自举语义不变
- **WHEN** Product 支持新的内部 Task Finish Result major，且所需 self-bootstrap 语义仍可无损映射到 v1
- **THEN** CLI MUST 继续输出 `buildr.task-finish-self-bootstrap-input/v1`
- **AND** bundled runner MUST 无需识别新的内部 Result identity

#### Scenario: 同 major 出现新增字段
- **WHEN** runner 读取包含未知 additive 字段的 self-bootstrap v1 payload
- **THEN** runner MUST 忽略未知字段并继续严格校验所有已知必需语义

#### Scenario: 自举语义发生不兼容变化
- **WHEN** Product 无法把内部 Result 无损投影为 self-bootstrap v1，或 runner 收到未知投影 major
- **THEN** CLI 或 runner MUST 返回稳定 diagnostic 并保持零 effect
- **AND** MUST NOT回退为解析 raw Task Finish Result

### Requirement: self-bootstrap detail 必须纳入公开 JSON coverage
Public JSON schema registry、CLI command registry、help、schema validation 与 checkout/npm parity MUST 同时登记 `task finish run|inspect --detail self-bootstrap`。既有缺省/显式 `compact` 与 `full` MUST 保持现有 schema identity、字段与退出语义。

#### Scenario: registry 遗漏 self-bootstrap detail
- **WHEN** CLI 已接受 `--detail self-bootstrap`，但 schema registry、关键字段 guard 或 checkout/npm parity 缺少任一 run/inspect 路径
- **THEN** Product verification MUST 失败并报告缺失 coverage

#### Scenario: 既有 detail 不受影响
- **WHEN** Agent 请求缺省或显式 `compact`，或显式 `full`
- **THEN** CLI MUST 分别保持 `buildr.task-finish-compact-result/v1` 与 canonical Task Finish Result identity
- **AND** MUST NOT把 self-bootstrap 专用字段加入既有 closed compact payload
