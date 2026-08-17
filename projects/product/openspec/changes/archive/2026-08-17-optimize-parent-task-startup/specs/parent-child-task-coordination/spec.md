## ADDED Requirements

### Requirement: Parent Coordination 必须派生启动就绪事实
Parent Coordination Application MUST基于current Task、matching Environment、Development Parent Plan、Planning Review与saved Contribution facts派生response-only启动就绪投影；MUST NOT新增Parent状态、Receipt、Result、表、migration或progress writer。

#### Scenario: Parent 已可启动首个 Child
- **WHEN** Parent active、Environment ready、Development与Parent Plan current、Planning Review ready且已被Development消费，并存在依赖已满足的未分配Contribution
- **THEN** Application MUST返回`ready`和稳定排序的eligible Contributions
- **AND** MUST保持零effects且不得自动创建或绑定Child

#### Scenario: Parent Planning Review 尚未被Development消费
- **WHEN** Parent Plan的Planning Review current且ready，但Development planning gate尚未保存matching Result引用
- **THEN** Application MUST返回精确refresh blocker与Parent planning refresh next action
- **AND** MUST NOT把Review slot存在直接伪装成Development gate current

### Requirement: Parent planning refresh 必须安全消费current Review
Buildr MUST提供受控Parent planning refresh动作，只从saved Parent Plan、current planning snapshot与Task Review Application读取输入，并由Task Development Application保存matching planning gate；调用方MUST NOT提交或重构完整planning JSON、Review正文或gate引用。

#### Scenario: current Review被安全消费
- **WHEN** active Parent具有current Parent Plan，Planning Review target等于Plan identity且outcome为`ready`
- **THEN** refresh MUST保持planning target/nodes与Parent Plan bytes不变并保存current planning gate引用
- **AND** Result MUST返回Development writer effect与更新后的启动就绪事实

#### Scenario: Review或Plan identity漂移
- **WHEN** Planning Review缺失、stale、changes-required或target不等于current Parent Plan identity
- **THEN** refresh MUST在Development零写入状态返回blocked与唯一恢复动作
- **AND** MUST NOT接受调用方提供的旧digest、旧target或手工gate作为fallback

### Requirement: Eligible Contribution 必须只来自saved协调证据
Parent启动投影 MUST只把未分配、未交付、未superseded且全部依赖已由saved handoff证明delivered或明确superseded的Contribution列为eligible；MUST NOT从Task completed、Git、文件、Change或canonical specs猜测依赖完成。

#### Scenario: Contribution依赖尚未得到handoff证明
- **WHEN** 未分配Contribution依赖另一个仍为unassigned、planned或unproven的Contribution
- **THEN** 启动投影 MUST不把该Contribution列为eligible
- **AND** MUST返回精确dependency blocker
