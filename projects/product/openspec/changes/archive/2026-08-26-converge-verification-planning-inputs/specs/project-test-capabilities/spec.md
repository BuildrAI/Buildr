## ADDED Requirements

### Requirement: Verification Plan 必须规范化Workspace与Project相对changed path
Buildr `verification plan` MUST在Request identity与capability selection前，把无歧义的managed Workspace-relative和Project-relative changed path规范化为canonical Project-relative path。Plan、selection reasons、provider input与Browser dispatcher MUST只消费canonical paths；绝对路径、`..`、越界、其他Project前缀或无法唯一归属的输入 MUST在Plan创建前失败关闭，并返回目标Project的registered root与期望路径形式。

#### Scenario: 两种相对根表达同一文件
- **WHEN** 调用方分别以`services/buildr/src/example.mjs`和registered Workspace前缀下的`projects/product/services/buildr/src/example.mjs`创建同一Project、target与selection的Plan
- **THEN** 两次Request identity、Plan identity、selected capabilities与selection reasons MUST相同

#### Scenario: changed path指向其他Project或越界
- **WHEN** Workspace-relative input不属于selected Project，或path包含绝对根与父级逃逸
- **THEN** Plan mutation MUST在provider与owner selection前blocked
- **AND** diagnostic MUST返回selected Project、registered source root与canonical Project-relative期望

### Requirement: Formal Plan-only 必须提供只读Preparation preview
当`verification plan`同时绑定matching formal Task Environment与canonical Workspace时，Buildr MUST在零execution、零Environment mutation和零Execution Record状态返回closed Plan result envelope。Envelope MUST包含原始`buildr.verification-plan/v1`、selected capabilities完整Preparation closure、`ready|action-required`状态、closure identity、全部requirements及适用的closed Task Environment plan request；`verification run --plan` MUST同时接受raw Plan与该envelope，并 MUST重新验证current declaration、Environment与closure，不得信任preview作为execution授权。

#### Scenario: 首次formal Plan发现辅助准备
- **WHEN** current Task Environment只有基础Buildr Service准备，而Plan选中需要Buildr与Buildr Web Recipe的Product capability
- **THEN** Plan result MUST以`action-required`返回包含两项requirement的完整plan request
- **AND** MUST NOT启动capability、执行Recipe、打开Execution Record或写Environment

#### Scenario: Agent先完成preview中的准备
- **WHEN** Agent把Plan result中的closed plan request原样交给Task Environment且prepare成功，再用同一Plan result启动formal run
- **THEN** run MUST直接通过preparation admission进入execution或返回其他真实blocker
- **AND** MUST NOT因正常首次发现再次返回`verification.preparation_blocked`

#### Scenario: 无formal Environment的普通Plan
- **WHEN** 调用方未同时提供`--environment`与`--workspace`
- **THEN** CLI MUST继续返回raw `buildr.verification-plan/v1`
- **AND** MUST不读取或要求Task Environment
