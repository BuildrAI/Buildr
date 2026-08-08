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
`buildr verification run --json` MUST 输出 `buildr.verification-execution/v1`，并 MUST 在成功、capability failure 与调用前 invalid request 路径保持单一 stdout JSON object。Payload MUST 区分 transient execution status、Project/declaration identity、requested target identity、实际 checks、精确 capability/resource authorization、真实 timing、target stability、Workspace Node/Environment execution context 与 evidence lifecycle；MUST NOT 声称 current Result、Candidate completeness 或 required assurance。

#### Scenario: 验证成功输出 JSON
- **WHEN** 所有显式 command capabilities 完成且 target observation 保持稳定
- **THEN** JSON MUST 返回 `status: passed`、每项 check facts、declaration identity、duration 与 transient evidence reference

#### Scenario: 验证业务失败输出 JSON
- **WHEN** capability 执行失败、资源等待失败或 execution context 在启动后失稳
- **THEN** stdout MUST 仍返回同一 `buildr.verification-execution/v1` family 的失败摘要并以非零状态退出
- **AND** payload MUST 包含已完成 checks、具体 failures、cleanup 状态和可用的结构化诊断，且 MUST NOT 写 current Result

#### Scenario: invalid request
- **WHEN** 参数、v2 declaration、capability identity、invocation kind、执行根或授权不合法
- **THEN** JSON MUST 返回 `status: failed`、空 checks 与结构化 error
- **AND** MUST 不生成 current Result 或误报 completed execution

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
