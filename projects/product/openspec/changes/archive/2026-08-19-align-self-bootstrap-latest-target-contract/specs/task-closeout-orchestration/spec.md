## MODIFIED Requirements

### Requirement: Runner 必须在 activation 副作用前有界收敛 latest target
每次适用self-bootstrap invocation MUST在持有target lease后读取并fetch latest target。只有retained checkout clean、Finish frozen ref是latest remote target的ancestor、后继无merge，且当前HEAD等于latest target或可fast-forward到该精确remote/branch并重新验证local/remote一致时，runner才 MUST把retained branch前进到latest ref并重算activation base；普通descendant的作者、工具与`Buildr-Task`或closeout trailer MUST NOT成为该行为的前置条件，且该行为 MUST不依赖foreign carrier清除后的特殊retry参数。

当retained Doctor blocked Result的latest target已越过Result绑定的delivery ref时，runner MUST在sync、安装或重启前先使用current exact token恢复一次同一Product Finish run。若返回matching `task-finish.target-race`，runner MUST最多再使用新token恢复一次，并在每次Product调用后重新获取/刷新target lease。Product返回matching Delivery Adaptation时，runner MUST返回carrier、resume与`deliveryAdaptation` guidance；除为读取latest target已完成的可证明fast-forward外，sync、commit/push、安装、重启、入口验证与Doctor effects MUST为空。返回新的doctor-blocked或complete Result时，runner MUST从该Result重新生成plan后继续。第二次仍target-race、其他blocked/failed或identity不匹配时 MUST停止，不得第三次resume或自动重跑runner。

#### Scenario: Latest target 已包含其他 Buildr 交付
- **WHEN** 当前Result的frozen ref之后存在已push、无merge的first-parent descendant，retained tree clean且可fast-forward到精确remote/branch
- **THEN** runner MUST在sync、安装和重启前fast-forward并以latest ref作为activation base
- **AND** MUST在lease内重算当前Result的frozen action plan，不得把foreign carrier目录顺序当作target顺序

#### Scenario: Doctor blocked run 可机械恢复 target-race
- **WHEN** latest target越过doctor-blocked Result的delivery ref，第一次same-run resume返回matching target-race，第二次在latest baseline可机械完成并返回doctor-blocked或complete
- **THEN** runner MUST采用新Result重建plan并继续适用activation
- **AND** Product Finish MUST仍独占carrier重建、equivalence、containment和delivery状态机

#### Scenario: Latest baseline 需要 Delivery Adaptation
- **WHEN** 第一次或第二次early Product resume返回matching Delivery Adaptation required
- **THEN** runner MUST在除必要latest-target fast-forward外的sync、commit/push、安装、重启、入口验证与最终Doctor零副作用状态返回Product carrier/token和完整blocked-only guidance
- **AND** Agent MUST只在该run-owned carrier内完成适配；runner不得自动解决语义冲突

#### Scenario: 有界恢复仍未收敛
- **WHEN** 第二次resume再次target-race，或Result的run、phase、code、carrier、token任一不匹配
- **THEN** runner MUST停止并报告实际Product Result
- **AND** MUST不调用第三次resume、不建立持久retry counter、队列或恢复store
