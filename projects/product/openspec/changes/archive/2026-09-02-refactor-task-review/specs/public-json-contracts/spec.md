## MODIFIED Requirements

### Requirement: Task Review CLI 必须提供稳定 operation JSON identity
`task review inspect|record` MUST输出closed `buildr.task-review-operation-result/v2`，每个slot包含v2 Result、`resultDigest`与`observedAt`，MUST不包含applicability、Development或Terminal facts。record冲突 MUST返回当前slot与稳定diagnostic且effects为空。

#### Scenario: CAS冲突JSON
- **WHEN** record提交陈旧expectedCurrentDigest
- **THEN** CLI MUST返回v2 blocked operation result和current digest
- **AND** MUST不覆盖current Result

#### Scenario: JSON inspect 成功
- **WHEN** 用户以`--json`检查存在或缺失的Review slots
- **THEN** MUST返回closed v2 operation envelope和两个slot

#### Scenario: JSON record blocked
- **WHEN** record输入不完整、Task terminal或CAS冲突
- **THEN** MUST返回v2 blocked envelope、diagnostic、current slots与零effects

#### Scenario: response-only digest
- **WHEN** inspect或record返回已有Result
- **THEN** `resultDigest` MUST由规范Result序列化计算且不写入Result或数据库revision列

## REMOVED Requirements

### Requirement: Task Entry Snapshot CLI 必须提供稳定公开 JSON identity
**Reason**: `task next`与Task Entry Snapshot已在前序Change删除。
**Migration**: Agent直接使用Task与专业接口。

#### Scenario: 旧客户端调用task next
- **WHEN** 旧客户端调用已删除的`task next`
- **THEN** CLI MUST返回unknown command且不得恢复Snapshot schema

### Requirement: Task Entry Snapshot JSON registry 必须与 command registry 同步
**Reason**: 公开command family已删除。
**Migration**: 删除陈旧canonical声明，不恢复registry。

#### Scenario: package检查JSON registry
- **WHEN** package检查公开JSON与command registry
- **THEN** 两者 MUST均不包含Task Entry Snapshot
