## ADDED Requirements

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

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: 持久化OpenSpec convergence receipt必须可移植
**Reason**: Receipt不再是需要随Archived Change交付的长期证据；其portable字段只服务当前事务恢复，正常归档后即释放。

**Migration**: 历史归档Receipt保持原样；新事务使用“OpenSpec Convergence Receipt必须只承担事务期恢复”并在成功归档后释放。

### Requirement: OpenSpec 收敛必须提供只读文件事实审计
**Reason**: “审计”误导为归档后的长期能力；真实需求是当前事务中的只读恢复检查。

**Migration**: 使用`buildr openspec convergence inspect`；正常Converge成功后不再执行检查，归档或清理后的调用返回`not-applicable`。
