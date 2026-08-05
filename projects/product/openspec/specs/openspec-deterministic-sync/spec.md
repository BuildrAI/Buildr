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

#### Scenario: 完整MODIFIED与baseline一致
- **WHEN** delta提供完整Requirement，baseline中有唯一原内容且current仍等于baseline
- **THEN** planner MUST生成完整替换operation并保留delta未要求删除之外的契约结构
- **AND** expected digest MUST绑定完整结果

#### Scenario: Partial MODIFIED省略既有Scenario
- **WHEN** planner无法证明delta是完整Requirement或省略内容是否应保留
- **THEN** 整批plan MUST blocked
- **AND** result MUST列出受影响Requirement和需要Agent判断的最小上下文

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

### Requirement: 持久化OpenSpec convergence receipt必须可移植
Buildr MUST 将运行时 OpenSpec executable 定位与持久化 identity 分离，并且新的 deterministic convergence 正常路径 MUST 只写一份 `.buildr/convergence-receipt.json`。Receipt MUST 保存 portable executable identity、convergence/plan identity、algorithm version、delta identity、每个 canonical 文件的完整 before/expected content 与 digests、disposition、验证/应用/确认/归档结果和时间，MUST NOT 保存机器绝对路径或长期内部 stage transitions。

#### Scenario: Task checkout执行convergence
- **WHEN** orchestrator 使用 task checkout 内的绝对 OpenSpec executable 完成 projected validation、apply 和 confirmation
- **THEN** 运行期间 MUST 核对同一 executable identity
- **AND** 落盘 receipt MUST 使用相对 Product/Service reference 或逻辑 source identity

#### Scenario: 应用完成但receipt更新前退出
- **WHEN** canonical 已全部等于 expected digests，但 receipt disposition 仍为 `planned-not-applied`
- **THEN** observer MUST 将实际状态识别为 `applied-and-matched`
- **AND** resume MUST 执行写后确认而不得重复写入或恢复 canonical

#### Scenario: 读取历史绝对路径receipt
- **WHEN** Buildr 读取旧 schema 的 convergence、baseline、pre-sync、sync-plan 或 recovery sidecar
- **THEN** reader MAY 只读解析完整 identity chain 用于迁移判断
- **AND** 任何新写入 MUST 只生成 portable 单一 receipt；证据不足 MUST 返回 `recovery-unprovable`

#### Scenario: 开源候选覆盖持久化receipt
- **WHEN** open-source candidate 或 contract fixture 检查 tracked active/archive convergence receipts
- **THEN** verification MUST 拒绝新生成的机器绝对路径、旧阶段型 sidecar 和重复 identity
- **AND** 单一 receipt MUST 保留足够事实证明 executable 与 canonical before/expected 结果

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
Buildr MUST 在 canonical actual digests 全部等于 expected digests且真实 Project 通过绑定 executable 的 strict validation 后，执行 `openspec archive <change> --yes --skip-specs`。Archive MUST 只移动 Change，不得再次修改 canonical。

#### Scenario: 正常同步并归档
- **WHEN** projected validation、条件式应用和写后确认全部通过
- **THEN** transaction MUST 以 `--skip-specs` 归档 Change并返回 `passed`
- **AND** receipt disposition MUST 更新为 `archived`

#### Scenario: 归档失败后重试
- **WHEN** canonical 已 confirmed 但 archive 命令失败
- **THEN** receipt MUST 保持 `applied-and-matched` 并记录 archive failure
- **AND** 下次 converge MUST 只重新确认 canonical 并重试 archive，不得恢复或重写 canonical

#### Scenario: 重复执行converge
- **WHEN** Change 已归档且 canonical 仍匹配 expected digests
- **THEN** converge MUST 幂等返回 `passed`
- **AND** MUST NOT 重复 apply 或创建旧 sidecar

### Requirement: OpenSpec 收敛必须提供只读文件事实审计
Buildr MUST 提供只读审计入口，使用唯一收敛回执中的 before/expected 摘要和当前正式文件事实逐文件分类。审计 MUST 只返回 Project 相对路径与摘要，不得写正式文件、刷新回执、创建旁路状态、归档 Change 或推断未被文件事实证明的恢复阶段。

#### Scenario: 部分文件异常变化
- **WHEN** 一部分正式文件等于 expected 而另一部分既不等于 before 也不等于 expected
- **THEN** 审计 MUST 返回 `recovery-unprovable` 和 `state-unknown`
- **AND** 每个文件 MUST 展示 before、expected、actual 摘要及 `before|expected|unknown` 分类

#### Scenario: 应用完成但回执未更新
- **WHEN** 所有正式文件均等于 expected 摘要而回执仍为 planned-not-applied
- **THEN** 审计 MUST 将实际事实分类为 `applied-and-matched`
- **AND** MUST NOT 为了修正声明而写回执

#### Scenario: 回执无效或缺失
- **WHEN** Buildr 无法读取或验证唯一收敛回执
- **THEN** 审计 MUST 返回 `recovery-unprovable` 和最小诊断
- **AND** MUST NOT 回退到 baseline、pre-sync receipt、sync plan 或 recovery receipt 生成新的授权事实

### Requirement: 历史收敛接口必须按零消费者门禁退役
Buildr MUST 维护历史 `baseline`、`check`、`sync-plan`、`sync-apply` 及旧旁路状态的单一退役登记。兼容入口在移除前 MUST 返回结构化弃用信息和 `converge` 或 `audit` 替代入口；新正常路径 MUST NOT 消费或生成旧旁路状态。只有当前产品、受管 Rules、Skills、Components、Commands 和非历史文档达到零消费者，且兼容窗口满足时，登记才可报告可删除。

#### Scenario: 旧命令仍被兼容调用
- **WHEN** consumer 调用仍处于兼容窗口的旧命令
- **THEN** Buildr MUST 保持既有行为并返回弃用状态、替代命令与移除条件
- **AND** 文本输出 MUST 明确提示该入口不会用于新的 Task Finish 路径

#### Scenario: 当前产品重新依赖旧命令
- **WHEN** 契约扫描发现非兼容实现或非历史夹具重新调用旧命令或依赖旧旁路文件
- **THEN** 正式验证 MUST 失败并报告消费者位置
- **AND** 退役登记 MUST NOT 报告可删除

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
