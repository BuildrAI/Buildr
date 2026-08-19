## MODIFIED Requirements

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
