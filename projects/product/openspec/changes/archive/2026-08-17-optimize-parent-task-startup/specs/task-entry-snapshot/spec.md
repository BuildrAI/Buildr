## ADDED Requirements

### Requirement: Task Entry Snapshot 必须提供Parent-aware next
当current Development表明Task采用Parent Plan时，Task Entry Snapshot MUST在保持Task、Environment和Development最早硬前置后读取Parent Coordination启动投影，并用Parent-specific recommendation替代普通Task的`develop-and-observe`；legacy Parent与普通Task MUST保持原判定。

#### Scenario: Review ready但尚未消费
- **WHEN** Parent Plan与Planning Review current且ready，但Development planning gate尚未绑定matching Review Result
- **THEN** Snapshot MUST返回`refresh-parent-planning` recommendation及retained controller route
- **AND** MUST不返回`develop-and-observe`或要求调用方构造内部Development input

#### Scenario: Parent已具备可启动Contribution
- **WHEN** Parent启动投影ready且包含至少一个eligible Contribution
- **THEN** Snapshot MUST返回`start-child-contribution` recommendation与稳定Contribution identities
- **AND** MUST保持零effects且不把recommendation解释为Child创建授权

#### Scenario: 普通Task保持既有next
- **WHEN** Development不存在Parent Plan或Parent Coordination返回legacy模式
- **THEN** Snapshot MUST继续使用既有Development typed next
- **AND** MUST不增加Parent Review或Contribution owner读取
