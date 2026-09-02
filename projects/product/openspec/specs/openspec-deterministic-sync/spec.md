# openspec-deterministic-sync Specification

## Purpose

定义 Buildr 如何从 delta、contract baseline 与 canonical facts 证明唯一同步结果，原子应用 identity-bound plan，并在语义歧义、输入漂移或验证失败时保持零写入和可恢复的 Agent fallback。

## Requirements

### Requirement: Sync planner必须证明唯一结果
Buildr MUST 提供纯 deterministic sync planner，比较 change delta、当前 canonical facts、active Change touches 与 OpenSpec executable/algorithm identity，并为每个 operation 返回 `safe`、`already-applied` 或 `blocked`、稳定 convergence/plan identity、before/expected digests、完整 expected content 和 decision reason。Planner MUST NOT 依赖持久化 contract baseline、Agent 或模型置信度判定确定性，且相同规范化输入 MUST 产生相同 plan。

#### Scenario: 完整ADDED Requirement不存在
- **WHEN** delta 提供结构完整且 identity 唯一的 ADDED Requirement，当前 canonical 中不存在同名 Requirement
- **THEN** planner MUST 生成唯一 append operation 与 expected canonical digest
- **AND** plan MUST 标记该 operation 为 `safe`

#### Scenario: ADDED Requirement已存在且内容相同
- **WHEN** canonical 中同名 Requirement 的规范内容已等于 delta 预期结果
- **THEN** planner MUST 标记 operation 为 `already-applied`
- **AND** apply MUST NOT 重复写入

#### Scenario: 输入存在语义歧义
- **WHEN** identity 重复、partial MODIFIED 无法证明 Scenario 保全、rename 目标已存在、删除对象无法唯一定位或 active Change 触达同一 Requirement
- **THEN** planner MUST 返回 `blocked` 与 `semantic-resolution-required`
- **AND** MUST NOT 生成可执行写入 operation

#### Scenario: 相同输入重复规划
- **WHEN** change、delta、canonical、active Change、executable 与 algorithm identity 均未变化
- **THEN** planner MUST 产生相同 convergence identity、plan identity、operations 与 expected digests
- **AND** planner MUST 不读取或写入阶段型 sidecar

### Requirement: Deterministic operation必须使用保守白名单
Planner MUST只自动接受能由结构与baseline证明唯一结果的完整ADDED、唯一REMOVED、无冲突RENAMED、baseline/current匹配的完整MODIFIED，以及identity唯一且内容完整的Scenario增改。未明确声明的Scenario缺失 MUST NOT被推断为删除。

当完整`MODIFIED`省略既有Scenario且两侧Scenario identity均唯一时，blocked item MUST保留既有capability、Requirement、operation与`semantic-resolution-required` code，并增加`reason: scenario-identities-omitted`及按确定顺序排列的`omittedScenarioIdentities`。该诊断 MUST只提供可移植identity，不复制Scenario正文，也不得授权Buildr自动保留或删除。

#### Scenario: 完整MODIFIED与baseline一致
- **WHEN** delta提供完整Requirement，baseline中有唯一原内容且current仍等于baseline
- **THEN** planner MUST生成完整替换operation并保留delta未要求删除之外的契约结构
- **AND** expected digest MUST绑定完整结果

#### Scenario: Partial MODIFIED省略既有Scenario
- **WHEN** planner确认canonical或baseline的唯一Scenario identities中存在delta未包含的identity
- **THEN** 整批plan MUST blocked且保持canonical零写入
- **AND** blocker MUST列出受影响Requirement、`scenario-identities-omitted` reason与全部`omittedScenarioIdentities`
- **AND** Agent MUST根据Change意图显式修订完整Requirement后重试，Buildr不得自行补回或删除Scenario

### Requirement: Sync apply必须原子且identity-bound
Buildr MUST 通过 canonical applier 只消费当前 convergence identity 对应且通过隔离验证的内存 plan；写入前 MUST 重验 change delta、OpenSpec executable identity 和全部 canonical before digests。任一 operation blocked 或任一输入变化时整批 MUST 零写入并重新观察/规划，不得修补旧 plan 或刷新旧 baseline。

#### Scenario: Safe批次成功应用
- **WHEN** 全部 operations 为 safe/already-applied、projected validation 通过且写入前 identity 仍匹配
- **THEN** applier MUST 先准备并核验全部临时文件，再以条件式原子替换提交
- **AND** result MUST 返回 actual digests、effects 和 plan identity

#### Scenario: Apply前canonical漂移
- **WHEN** plan 生成后任一 canonical before digest 发生变化
- **THEN** applier MUST 返回输入漂移并保持全部 canonical 文件不变
- **AND** orchestrator MUST 观察当前事实后重新规划，不得刷新事后授权

#### Scenario: 中间文件写入失败
- **WHEN** temporary 生成、验证或 rename 准备阶段任一步骤失败
- **THEN** applier MUST 在首个 canonical replace 前保持整批零写入
- **AND** 若 replace 已开始后进程中断，下一次 MUST 由 observer 比较真实文件而不是信任内部 stage

### Requirement: Deterministic sync必须提供Agent fallback证据
当 plan blocked 时，Buildr MUST 返回 `blocked`、blocked operations、权威输入引用和未执行 effects；当真实文件无法由 receipt 的 before/expected digests 证明时 MUST 返回 `recovery-unprovable`。Agent 只处理这两类结果，不得参与内部 plan、validation、apply、confirmation 或 receipt 编排。

#### Scenario: Task Finish遇到blocked plan
- **WHEN** convergence transaction 检测到同一 Requirement 并发修改、结构歧义或 expected strict validation 失败
- **THEN** Task Finish MUST 接收 `blocked` 与最小语义处理上下文
- **AND** MUST NOT 把 convergence 或 canonical sync 标记 passed

#### Scenario: Task Finish遇到不可证明状态
- **WHEN** canonical 文件既不完整匹配 receipt before digests 也不完整匹配 expected digests
- **THEN** Task Finish MUST 接收 `recovery-unprovable` 并停止自动处理
- **AND** Buildr MUST NOT 覆盖当前 canonical 内容

### Requirement: Deterministic apply必须在提交前验证完整expected Project
Buildr MUST 在替换真实canonical前，把本批次全部expected OpenSpec files投射到task-owned temporary Project surface，并使用receipt绑定的OpenSpec executable/version执行strict validation。只有expected surface验证通过且input/output digests仍匹配时才能原子提交；失败时整批MUST零写入并返回validation diagnostic与Agent fallback。

#### Scenario: 新capability缺少严格结构
- **WHEN** deterministic plan生成的新capability缺少`Purpose`、`Requirements`或其他当前strict validator要求的结构
- **THEN** apply MUST在真实canonical写入前返回blocked
- **AND** actual canonical files MUST保持不变

#### Scenario: Expected surface严格验证通过
- **WHEN**全部expected files在temporary Project中通过绑定版本的strict validation且receipt identity未变化
- **THEN** apply MUST原子提交完整批次
- **AND** result MUST记录expected digests、validator identity、duration和diagnostic reference

### Requirement: 新capability Purpose必须来自明确authority
Planner MUST只从proposal中对应New Capability的唯一非空描述取得新canonical Purpose authority，并 MUST NOT由Requirement正文、模型补写或默认模板推断语义。Purpose缺失、重复或不能形成可strict验证的expected surface时，整批plan MUST返回`semantic-resolution-required`。

#### Scenario: Proposal描述不足以形成合法Purpose
- **WHEN** new capability的proposal描述缺失、重复或导致expected strict validation失败
- **THEN** planner或apply MUST返回blocked与最小修复引用
- **AND** MUST NOT创建部分canonical capability

### Requirement: Convergence observer必须根据真实文件恢复
Buildr MUST 使用 convergence receipt 的 before/expected digests 观察 canonical 实际状态，并且只产生 `planned-not-applied`、`applied-and-matched`、`state-unknown` 或 `archived` disposition。Observer MUST NOT 根据上次声明的内部 stage 推断恢复动作。

#### Scenario: canonical全部等于before
- **WHEN** receipt 中所有 canonical 文件当前 digest 均等于 beforeDigest
- **THEN** observer MUST 返回 `planned-not-applied`
- **AND** orchestrator MUST 重新核验 executable/validation 后条件式应用

#### Scenario: canonical全部等于expected
- **WHEN** receipt 中所有 canonical 文件当前 digest 均等于 expectedDigest
- **THEN** observer MUST 返回 `applied-and-matched`
- **AND** orchestrator MUST 只执行写后确认和后续归档

#### Scenario: canonical处于混合或未知状态
- **WHEN** 文件集合同时包含 before/expected 状态或任一文件两者都不匹配
- **THEN** observer MUST 返回 `state-unknown`
- **AND** public result MUST 为 `recovery-unprovable` 且零自动覆盖

#### Scenario: delta或executable变化
- **WHEN** delta identity 变化
- **THEN** orchestrator MUST 丢弃旧 plan 执行资格并基于当前 canonical 重新规划
- **AND** executable identity 变化时 MUST 重跑 projected validation 和写后 strict confirmation

### Requirement: Convergence transaction必须确认后单独归档
Buildr MUST 在 canonical actual digests 全部等于 expected digests且真实 Project 通过绑定 executable 的 strict validation 后，执行 `openspec archive <change> --yes --skip-specs`。Archive MUST 只移动 Change，不得再次修改 canonical；archive成功后transaction MUST释放本次Convergence Receipt，再返回`passed`。

#### Scenario: 正常同步并归档
- **WHEN** projected validation、条件式应用、写后确认、archive与Receipt release全部通过
- **THEN** transaction MUST 以 `--skip-specs` 归档 Change并返回 `passed`
- **AND** result MUST表达`archived`且Receipt已释放，不得要求后续Inspect

#### Scenario: 归档失败后重试
- **WHEN** canonical 已 confirmed 但 archive 命令失败
- **THEN** Receipt MUST 保持 `applied-and-matched` 并记录 archive failure
- **AND** 下次 Converge MUST 只重新确认 canonical 并重试 archive，不得恢复或重写 canonical

#### Scenario: 归档成功但Receipt释放失败
- **WHEN** Change已经归档但本次Receipt未能安全释放
- **THEN** Converge MUST返回可重试的blocked终结结果并保持canonical和archive不变
- **AND** 重试 MUST只完成终态确认与Receipt release，不得重复apply或archive

#### Scenario: 重复执行converge
- **WHEN** Change 已归档且本次事务Receipt已经释放
- **THEN** Converge MUST 幂等返回 `passed`与`archived`
- **AND** MUST NOT重新创建Receipt、重复apply或要求历史文件审计

### Requirement: 历史收敛接口必须按零消费者门禁退役
Buildr MUST 维护历史 `baseline`、`check`、`sync-plan`、`sync-apply`及`audit`入口与旧旁路状态的单一退役登记。当前写入口 MUST只有`converge`，当前只读恢复入口 MUST只有`convergence inspect`；新正常路径 MUST NOT消费或生成旧旁路状态。只有当前产品、受管Rules、Skills、Components、Commands和非历史文档达到零消费者，登记才可报告旧入口已删除。

#### Scenario: 旧命令仍被兼容调用
- **WHEN** consumer调用`openspec audit`、`baseline create`、`check`、`sync-plan`或`sync-apply`
- **THEN** Buildr MUST返回标准unknown-command诊断和适用的当前命令建议
- **AND** MUST NOT读取或写入Receipt、旧sidecar、canonical或archive

#### Scenario: 当前产品重新依赖旧命令
- **WHEN** 契约扫描发现非历史实现、受管Skill或非历史文档重新调用旧命令或依赖旧旁路文件
- **THEN** 正式验证 MUST失败并报告消费者位置
- **AND** 退役登记 MUST NOT报告当前流程已收敛

### Requirement: Convergence transaction 必须在任何写入前门禁 Change checklist
Buildr MUST 在 active Change 的 canonical planning、receipt写入、canonical apply和archive之前，以与Change read model相同的Markdown checkbox语义检查现有`tasks.md`。存在任一未完成checkbox时，convergence MUST返回`blocked`与稳定的checklist progress，且不得写receipt、canonical spec或调用archive；Buildr MUST NOT自动勾选、删除或把归档后Task lifecycle evidence解释为Change task完成。

#### Scenario: Change仍有未完成checkbox
- **WHEN** active Change的`tasks.md`同时包含已完成与未完成checkbox
- **THEN** `buildr openspec converge` MUST返回`change-checklist-incomplete`及`completed`、`total`、`remaining`
- **AND** canonical files、convergence receipt与archive lifecycle MUST保持不变

#### Scenario: Change checklist已经闭合
- **WHEN** active Change的全部checkbox均已完成且其他convergence门禁通过
- **THEN** transaction MUST继续执行确定性planning、validation、apply、confirmation与archive
- **AND** archive后Task Development、Task Finish、Environment cleanup与Task terminal evidence MUST由各自authority形成，Task current records MUST只写Workspace SQLite且不得回写archive checkbox

### Requirement: 全部 Requirements 清退必须删除 canonical capability spec
当一个现有 capability 的全部 canonical Requirements 都被同一无歧义 delta 安全删除时，deterministic convergence MUST 将目标建模为 expected absent，而不是生成没有 Requirements 的空 spec。Plan 与 receipt MUST 保存 before/expected existence，projected strict validation MUST 在隔离树中删除目标，canonical applier MUST 原子删除目标文件并在批次失败时恢复 before bytes，observer MUST 只在目标文件确实不存在时确认 expected state。

#### Scenario: 唯一 capability Requirements 全部清退
- **WHEN** delta 对现有 capability 的全部且仅有 Requirements 执行可证明唯一的 REMOVED operations
- **THEN** plan MUST 把 canonical `spec.md` 标记为 expected absent并让隔离投影通过strict validation
- **AND** apply成功后文件 MUST不存在，receipt与observer MUST把absence确认为applied-and-matched

#### Scenario: 删除批次后续写入失败
- **WHEN** canonical applier已删除expected-absent spec但同批次后续文件提交失败
- **THEN** applier MUST从receipt-bound before content恢复被删除spec
- **AND** 整批 MUST NOT返回passed或留下before/expected混合状态

#### Scenario: expected-absent capability 已经不存在
- **WHEN** 同一完整REMOVED delta被重新规划且canonical capability spec已经不存在
- **THEN** planner MUST将该capability保持为expected absent并把每项删除标记为already-applied
- **AND** MUST NOT把它误判为缺少Purpose的新capability创建请求

### Requirement: OpenSpec Convergence Receipt必须只承担事务期恢复
Buildr MUST 在首次 canonical mutation 前把唯一 Convergence Receipt 写入当前 Change 的 `.buildr/convergence-receipt.json`，并使用 portable executable identity、convergence/plan/delta identity、每个 canonical 文件的完整 before/expected content 与 digests、disposition及验证/应用/确认结果支持同一收敛事务恢复。Receipt MUST 是 Task 执行位置中的控制材料，不得成为归档后的规范、Task完成、Git交付或长期审计 authority；正常事务成功归档后 MUST 释放本次 Receipt，且不得要求 Formal Task Finish 或 Environment cleanup 后仍可读取它。

#### Scenario: 收敛中断前已写入Receipt
- **WHEN** transaction 已写入 Receipt 但尚未完成 canonical apply、confirmation 或 archive
- **THEN** 同一 Task 执行位置中的后续 Converge 或 Convergence Inspect MUST 使用该 Receipt 观察真实文件
- **AND** MUST NOT 从调用方声明、旧 baseline 或内部 stage 猜测恢复状态

#### Scenario: 正常收敛成功
- **WHEN** canonical apply、写后 strict confirmation、archive 与本次 Receipt release全部成功
- **THEN** Converge MUST 返回 `passed` 与 `archived`
- **AND** Archived Change、Canonical Specs、Git和后续专业Task事实 MUST成为正常长期authority，Receipt MUST NOT进入Delivery Carrier

#### Scenario: 历史归档仍有旧Receipt
- **WHEN** Workspace包含本能力交付前已经归档并保存的历史Receipt
- **THEN** Buildr MUST保持历史文件原样可读且不得自动backfill、重写或批量删除
- **AND** 新正常流程 MUST NOT把这些历史Receipt作为当前事务或长期交付的required authority

### Requirement: OpenSpec 收敛必须提供事务期只读检查
Buildr MUST 提供 OpenSpec Convergence Inspect，只在当前收敛恢复现场使用唯一 Receipt 的 before/expected 与当前 canonical 文件事实逐文件分类。Inspect MUST 只返回 Project 相对路径、摘要、`passed|not-applicable|recovery-unprovable`和明确next action，不得写 canonical、Receipt、archive、旁路状态或Task专业事实。

#### Scenario: 当前事务尚未应用
- **WHEN** active Change存在有效Receipt且全部canonical文件等于before
- **THEN** Inspect MUST返回`passed`与`planned-not-applied`
- **AND** 唯一后续动作 MUST为重新运行同一Converge

#### Scenario: 当前事务已经应用但尚未终结
- **WHEN** active Change存在有效Receipt且全部canonical文件等于expected
- **THEN** Inspect MUST返回`passed`与`applied-and-matched`
- **AND** 唯一后续动作 MUST为重新运行同一Converge完成confirmation/archive

#### Scenario: 当前事务文件为混合或未知状态
- **WHEN** active Change存在Receipt但任一canonical文件既不等于before也不等于expected，或文件集合处于mixed状态
- **THEN** Inspect MUST返回`recovery-unprovable`与`state-unknown`
- **AND** 每个文件 MUST展示before、expected、actual摘要及`before|expected|unknown`分类

#### Scenario: 收敛尚未开始
- **WHEN** active Change不存在Convergence Receipt
- **THEN** Inspect MUST返回`not-applicable`与`convergence-not-started`
- **AND** MUST NOT把Receipt缺失报告为恢复失败

#### Scenario: Change已经归档
- **WHEN** Change lifecycle已经是archived
- **THEN** Inspect MUST返回`not-applicable`与`convergence-terminal`
- **AND** MUST NOT要求读取历史Receipt或在Worktree清理后返回`recovery-unprovable`

### Requirement: OpenSpec Converge 必须明确使用 Task execution root
`buildr openspec converge` MUST将 `--target` 表达并校验为当前 Task Environment 允许的 execution root，而不是 canonical Workspace authority root。CLI MUST在 target 中无法解析 active Change 时返回零写入诊断，要求 Agent使用 matching Environment Receipt 的 `execution.workdir`，并 MUST NOT扫描、猜测或自动选择其他 worktree。

#### Scenario: CLI 展示 converge target
- **WHEN** Agent读取 `buildr openspec converge` 的命令帮助
- **THEN** `--target` MUST显示为 `<task-execution-root>` 或等价明确表述
- **AND** MUST不使用无法区分 canonical Workspace 与 Task Environment 的 `<workspace>` 或 `<dir>` 占位符

#### Scenario: canonical Workspace 看不到 active Change
- **WHEN** Agent把 canonical Workspace 作为 converge target，且 active Change 只存在于 matching Task execution root
- **THEN** command MUST在 canonical、receipt 与 archive 零写入状态返回 active Change not found 诊断
- **AND** next action MUST要求从 Environment Receipt 使用 `execution.workdir` 重试，不得自动搜索或修改 canonical Workspace绕过

### Requirement: Deterministic planner必须提供只读语义就绪预检
Buildr MUST在OpenSpec Change进入apply前提供只读semantic readiness preflight，并复用最终convergence的active conflict detection、planner与projected strict validation。Preflight只证明当前规范语义可执行，不拥有Task Review，也不把Review作为apply许可。

#### Scenario: 当前Change语义就绪
- **WHEN** delta与canonical产生唯一plan、没有active conflict且projected strict validation通过
- **THEN** preflight MUST返回ready、operations/files与零effects
- **AND** next action MUST进入planning identity/apply，并说明Review由Agent独立判断

#### Scenario: 完整MODIFIED省略既有Scenario
- **WHEN** planner确认delta省略canonical Requirement的既有Scenario identity
- **THEN** preflight MUST返回blocked与scenario-omission
- **AND** MUST保留omittedScenarioIdentities且不自动补回或删除

#### Scenario: Rename或identity无法唯一证明
- **WHEN** Requirement或Scenario identity不能唯一解析
- **THEN** preflight MUST返回blocked与identity-conflict及底层code
- **AND** MUST不生成可执行写入资格或Review占位

### Requirement: 语义就绪结果必须绑定当前完整观察
Preflight MUST 产生稳定`readinessIdentity`，绑定change、project、plan identity、delta digest、canonical before facts、按确定顺序排列的全部active Change id/delta observation，以及OpenSpec executable/algorithm identity。任一输入变化后旧结果 MUST视为陈旧；`converge` MUST始终重新读取当前事实、重新规划和重新验证，并 MUST NOT接受preflight结果作为apply授权。

#### Scenario: Preflight后canonical或active Change变化
- **WHEN** ready结果形成后canonical spec、delta、active Change set/content、executable或algorithm identity发生变化
- **THEN** 再次preflight MUST产生不同readiness identity或不同状态
- **AND**最终converge MUST基于变化后的事实重新检查而不得复用旧ready

#### Scenario: 输入保持不变
- **WHEN** 相同规范化delta、canonical、active Change observations、executable与algorithm identity重复执行preflight
- **THEN** 结果 MUST产生相同readiness identity、plan identity、operations和blocker分类
- **AND**duration等非identity运行数据 MUST不影响identity
