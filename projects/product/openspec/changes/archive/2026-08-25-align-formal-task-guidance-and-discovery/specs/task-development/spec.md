## ADDED Requirements

### Requirement: Parent startup next 不得遮蔽 current Acceptance 后的 Development next
Parent Coordination startup projection MUST只在仍有协调动作时提供`startup.next`。当 current Parent Acceptance 已绑定 current Parent Plan 且所有 Contribution prerequisites 已满足时，startup MUST不再推荐`accept-parent`；Task Entry composition MUST保留同次 Task Development read model 的真实 typed next，且 MUST不在Parent层推测后续Development action。

#### Scenario: current Parent Acceptance 后读取 task next
- **WHEN** Parent Acceptance的`planIdentity`等于current Parent Plan identity，且Parent coordination prerequisites已满足
- **THEN** Parent startup projection MUST不返回`accept-parent` next
- **AND** 顶层`task next` MUST返回Task Development当前状态派生的typed next
- **AND** 读取 MUST不重复写Acceptance、推进Task或改变任何gate

#### Scenario: Acceptance 尚未 current
- **WHEN** prerequisites已满足但Parent Acceptance缺失或绑定旧Plan identity
- **THEN** Parent startup projection MUST继续推荐`accept-parent`
- **AND** Task Entry MUST不越过Parent最终集成验收
