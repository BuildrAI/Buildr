## MODIFIED Requirements

### Requirement: Task Finish run 必须提供 portable execution record operation summary
`buildr task finish run|inspect --json` MUST按`--detail compact|full`返回不同且稳定的公开JSON投影。缺省或显式`--detail compact` MUST返回closed `buildr.task-finish-compact-result/v1`；显式`--detail full` MUST继续输出既有`buildr.task-finish-result/v2`。compact MUST保留Task/run/status、current phase、Development handoff、Candidate/generation、Content Target、主失败、唯一next workflow/action、matching resume、关键carrier/target/remote refs、delivery/completion disposition、阶段与总体timing，以及run调用可用的portable`executionRecord` summary；MUST NOT透传完整checks、operations、observations、stdout/stderr、diagnostics正文、本机locator或未登记字段。full payload的字段与语义 MUST保持兼容。

`executionRecord` summary MUST表达`not-opened|retained|blocked|attention`、portable record identity/outcome/lifecycle/body summary、diagnostics transient cleanup、diagnostic与next action。compact与full均 MUST NOT暴露SQLite/database、body或transient locator、本机持久路径、Carrier绝对路径、remote credential、lease或resource token，也 MUST NOT把execution record解释为Finish current、delivery、Task terminal或Result adoption authority。`task finish inspect --json` MUST保持pure Finish read model且不添加record列表或正文。

当`buildr task finish run --json`在创建run之前因入口聚合缺口失败时，CLI MUST输出`buildr.cli-error/v1`，且`error.code` MUST为`task_finish.entry_gaps`；`error.details.gaps` MUST包含`development`、`environment`、`delivery`三个数组（可空），每项至少含既有`code`与`message`；若`development`非空，`suggestions`或等价next指示 MUST指向`task-development`。该失败路径 MUST NOT返回伪Finish run result或`executionRecord`。

#### Scenario: 缺省 compact 输出
- **WHEN** Agent执行`task finish run|inspect --json`且没有显式`--detail`
- **THEN** CLI MUST返回`buildr.task-finish-compact-result/v1`与`detail: compact`
- **AND** payload MUST只包含closed compact字段，不得与full payload逐字相同

#### Scenario: 显式 full 输出
- **WHEN** Agent执行`task finish run|inspect --detail full --json`
- **THEN** CLI MUST返回兼容的`buildr.task-finish-result/v2`
- **AND** 现有完整phase、delivery、completion与diagnostic facts MUST保持可用

#### Scenario: Finish invocation retained
- **WHEN** 一次实际执行的Finish invocation已terminal seal且record retained
- **THEN** run compact JSON MUST返回portable record ID、outcome、lifecycle、body digest/size/truncated与diagnostics cleanup disposition
- **AND** 顶层Finish status、failure、resume与delivery facts MUST继续由`task_finish_current`决定

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

## ADDED Requirements

### Requirement: Task Finish compact schema 必须由自动覆盖保护
Buildr MUST在public JSON registry、CLI help、schema coverage与checkout/npm parity中登记`buildr.task-finish-compact-result/v1`。compact字段白名单、关键恢复字段与禁止字段 MUST由自动测试保护；新增full Result字段 MUST NOT未经显式契约更新自动进入compact。

#### Scenario: compact registry 漂移
- **WHEN** Task Finish compact CLI可达但schema registry、关键字段guard或checkout/npm parity任一缺失
- **THEN** Product verification MUST失败并报告缺失的compact family

#### Scenario: compact 泄漏完整诊断
- **WHEN** compact payload包含完整operations、checks、observations、stdout/stderr、diagnostics正文或本机locator
- **THEN** public JSON contract test MUST失败
