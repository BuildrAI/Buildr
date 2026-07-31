## MODIFIED Requirements

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

## ADDED Requirements

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
