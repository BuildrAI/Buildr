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
`buildr verification run --json` MUST 返回 `buildr.verification-run/v1` 顶层 identity，并至少包含 operation、status、requiredAssurance、project、policy sources、environment context、candidate identity、plan decisions、checks、resource events、candidate completeness、duration、timing source、failures、skips、evidence identity、reference 与 lifecycle；checkout 和 npm tarball MUST 保持 schema parity。

#### Scenario: 验证成功输出 JSON
- **WHEN** verification run 完整通过并请求 JSON
- **THEN** stdout MUST 是单一 `buildr.verification-run/v1` 对象
- **AND** worker stdout/stderr MUST 作为有边界的字段或 evidence reference 返回，不得破坏 envelope

#### Scenario: 验证业务失败输出 JSON
- **WHEN** required check 失败、资源等待超时或 context binding 被拒绝
- **THEN** stdout MUST 仍返回同一 schema family 的失败摘要并以非零状态退出
- **AND** payload MUST 包含确定性 error code、已完成检查和 cleanup 状态

### Requirement: Task Record CLI 必须提供稳定公开 JSON identity
`buildr task create|inspect|update|complete|abandon --json` MUST 返回 `buildr.task-record-result/v1` 顶层 identity，并 MUST 至少包含 operation、status、taskId、canonical path、record、`recordDigest: string|null`、diagnostic、effects 与 nextActions；checkout 和 npm tarball CLI MUST 保持 schema parity。非空 `recordDigest` 是当前有效 canonical bytes 的响应级 evidence，不属于持久 Task Record schema；记录不存在或无法形成有效 read model 时为 `null`。

#### Scenario: Task Record 操作成功
- **WHEN** 五个 action 中任一成功并请求 JSON
- **THEN** stdout MUST 是单一有效 `buildr.task-record-result/v1` 对象且 stderr 为空
- **AND** payload MUST 返回实际 operation、created/inspected/updated/completed/abandoned status、当前 record、匹配该 record bytes 的 `recordDigest` 与精确 effects

#### Scenario: Task Record 业务冲突
- **WHEN** action 因重复 identity、state conflict、无效引用、损坏 record 或 canonical root 证明失败而 blocked
- **THEN** stdout MUST 仍返回 `buildr.task-record-result/v1` blocked 对象并以非零状态退出
- **AND** payload MUST 包含稳定 error code、未发生 effects、可用 Task identity、可证明时的当前 `recordDigest` 与唯一 next action

#### Scenario: Task Record 命令语法错误
- **WHEN** 调用缺少 task-id、required title/intent/summary/reason，update 没有 mutation flag，或包含未知/冲突参数
- **THEN** CLI MUST 使用登记的 `buildr.cli-error/v1` envelope 和对应 Task Manager help topic
- **AND** MUST NOT 输出部分 Task Record result 或混入人类可读文本

#### Scenario: JSON 暴露暂缓字段
- **WHEN** Task Record result 的 `record` 或 canonical fixture 包含 revision、`recordDigest`、workspaceId、storage/publication classification、Environment identity 或专业 record reference
- **THEN** public schema verification MUST 失败
- **AND** 顶层 `recordDigest` MUST NOT 被解释或渲染为 `task.yml` 字段，checkout/npm parity MUST NOT 以两端同时漂移为通过

#### Scenario: JSON coverage 未登记新 action
- **WHEN** command registry 已启用任一 Task Record JSON action，但 public schema registry、关键字段检查或 checkout/npm parity 没有覆盖
- **THEN** 产品验证 MUST 失败并报告遗漏的 command/schema family

### Requirement: Task Environment CLI 必须提供稳定公开 JSON identity
`buildr task environment prepare|inspect|cleanup --json` MUST 返回 `buildr.task-environment-result/v1` 顶层 identity，并 MUST 至少包含 operation、`status: ready|blocked|unavailable|cleaned`、taskId、canonical Environment Receipt path/availability、`observedAt`、sanitized environment read model、diagnostic、effects 与 nextActions；checkout 和 npm tarball CLI MUST 保持 schema parity。read model MUST 区分 Environment 总事实与 provider evidence summary，并 MUST NOT 把这些字段解释为 Task Record 内容。

#### Scenario: Environment 操作成功
- **WHEN** 三个 action 中任一成功并请求 JSON
- **THEN** stdout MUST 是单一有效 `buildr.task-environment-result/v1` 对象且 stderr 为空
- **AND** payload MUST 返回实际 operation、对应 `ready|unavailable|cleaned` status、当前观察时间、read model 与精确 effects；不得用 status 重复建立通用生命周期状态机

#### Scenario: Environment 业务阻塞
- **WHEN** action 因 Task 不存在、identity/drift、scope/provider、Runtime/CLI/依赖/projection、资源、cleanup authorization 或 migration conflict 被 blocked
- **THEN** stdout MUST 仍返回 `buildr.task-environment-result/v1` blocked 对象并以非零状态退出
- **AND** payload MUST 包含稳定 error code、已发生/未发生 effects、可用 Environment identity 与唯一 next action

#### Scenario: Inspect 尚无 Environment Receipt
- **WHEN** 有效 Task 尚未准备 Environment 且调用方执行 `inspect --json`
- **THEN** payload MUST 返回成功的只读 `unavailable` 结果、稳定 no-receipt diagnostic、`observedAt`、空 read model 与 prepare next action
- **AND** MUST NOT 把缺少 Receipt 作为损坏 Task、创建 Receipt 或伪造 blocked preparation effect

#### Scenario: JSON 暴露敏感或越权字段
- **WHEN** public result 包含凭证、进程 secret、任意 cleanup shell、内部 resource handle、完整 provider receipt、Agent session handle 或 Task Record 环境字段
- **THEN** public schema verification MUST 失败
- **AND** public read model MUST 只保留 UI/Agent 判断所需的 sanitized identity、状态、摘要与 evidence reference

#### Scenario: JSON coverage 未登记 Environment action
- **WHEN** command registry 已启用任一 Task Environment JSON action，但 schema registry、关键字段检查或 checkout/npm parity 没有覆盖
- **THEN** 产品验证 MUST 失败并报告遗漏的 command/schema family
- **AND** 内部 `resource register/release` MUST NOT 被误列为 public JSON 命令

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
