## MODIFIED Requirements

### Requirement: Task Verification 必须维护一个 Task-scoped current Result
Buildr MUST 为每个正式Task在Workspace SQLite中提供至多一份`buildr.task-verification-result/v1` current Result。Result MUST只包含Task/stable Content Target、Project declaration identities、实际执行capability facts、coverage gaps、整体结论与完成时间，并MUST保持可移植值语义但不进入Git。Verification Result MUST NOT绑定或生成Task Candidate。

#### Scenario: 完整验证形成 current Result
- **WHEN** Agent已针对Development观察到的明确stable Content Target完成全部选择、执行和事实提炼
- **THEN** Application MUST写入该Task唯一current Result，且`target.identity` MUST等于Content Target identity
- **AND** Result MUST NOT包含Candidate/generation、stdout、stderr、临时目录、本机绝对路径、Environment Receipt、resultDigest或applicability

#### Scenario: 没有测试能力
- **WHEN** Task scope内某个目标没有可用声明或适用能力
- **THEN** Result MUST通过`coverageGaps`如实记录缺口
- **AND** Verification MUST NOT自动创建测试、脚本或capability declaration

#### Scenario: 旧 Verification YAML 存在
- **WHEN** `.buildr/tasks/<task-id>/verification.yml` 存在、损坏或与SQLite不同
- **THEN** Application MUST只读取SQLite current Result
- **AND** MUST NOT迁移、双写、删除或生成兼容YAML

### Requirement: Result 必须原子整值替换且失败时保留 current
Repository MUST 在写入前完成 closed-schema normalization 与 serialization round-trip，再以单一 SQLite transaction 精确替换 current row并在提交前重读验证。任何写入阶段失败 MUST rollback并返回精确 stage diagnostic，且 MUST 保留原 current value。

#### Scenario: 执行中断或完整结论尚未形成
- **WHEN** execution 被中断、超时、只完成部分能力或 Agent 尚未形成完整 Task 结论
- **THEN** caller MUST NOT 调用 record
- **AND** 已有 current MUST 保持不变

#### Scenario: mutation 后 post-read 失败
- **WHEN** 新值已写入 transaction 但 Repository 无法重读确认
- **THEN** Repository MUST rollback整个transaction
- **AND** 原 current Result及其他Task current records MUST保持不变

#### Scenario: rename 后 post-read 失败
- **WHEN**遗留filesystem rename/post-read fault path被调用或注入
- **THEN** SQLite repository MUST不执行该已清退stage且MUST不读取或写回旧YAML
- **AND** 原current Result与其他Task current records MUST保持不变

## REMOVED Requirements

### Requirement: Task Verification writer 必须声明 portable publication path
**Reason**: Verification current Result 已由 Workspace SQLite 独占持久化，不再参与 metadata publication。

**Migration**: consumer 继续调用 Task Verification Application；旧 YAML 保持 inert且不迁移。
