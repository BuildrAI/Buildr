## MODIFIED Requirements

### Requirement: Runner 必须可从可重算事实幂等恢复
Runner MUST只根据同一Finish Result、retained Git/ref/remote、Buildr正式交付或self-bootstrap commit provenance、带current run与plan identity的successor commit、当前sync输出、installer和Doctor事实判断fresh、fresh-descendant、resume或already-complete；MUST NOT创建持久化runner state。`plan.baseRef` MUST继续绑定Finish frozen ref；动态`activationBaseRef`只有在当前HEAD等于baseRef，或baseRef到当前HEAD为无merge、每个commit均带`Buildr-Task` trailer或成对`Buildr-Finish-Run`/`Buildr-Closeout-Plan` trailer、working tree clean且remote精确等于HEAD时才能前进。当前HEAD若是本run/plan的精确successor，其parent MUST作为activation base，remote只可等于parent或HEAD。无法证明时 MUST fail closed并保留现场。

#### Scenario: 重跑复用未push的successor commit
- **WHEN** retained HEAD是当前run/plan绑定的精确successor，其parent位于Finish frozen ref的可证明Buildr-owned descendant chain上、sync重算后tree clean且remote仍为parent
- **THEN** runner MUST复用已有commit并从push阶段继续
- **AND** MUST NOT重复commit、amend或重新stage无关内容

#### Scenario: Remote已经包含successor commit
- **WHEN** 本地successor commit满足当前run/plan且远端target回读已经等于该commit
- **THEN** commit与push阶段 MUST报告幂等passed并继续适用安装与finalize
- **AND** MUST NOT再次push或创建第二个successor commit

#### Scenario: 多个已完成Finish等待激活
- **WHEN** 当前Result的frozen ref之后存在一个或多个已push的Buildr Formal Finish commit或其他self-bootstrap successor，全部形成无merge、provenance完整的first-parent chain，retained HEAD与remote精确一致且tree clean
- **THEN** runner MUST选择当前HEAD作为activation base，并按当前Result的frozen Task Contribution paths重算和执行自身去重plan
- **AND** 若sync产生delta，新successor MUST直接以该activation base为parent；后续Result MUST能把它作为可证明descendant继续顺序收敛

#### Scenario: Buildr-owned descendant无需sync commit
- **WHEN** runner在可证明descendant上执行当前Result且sync不适用或重算后没有delta
- **THEN** runner MUST不创建空successor commit，并继续适用安装、默认CLI identity与finalize
- **AND** MUST在结果中保留frozen ref与实际activation base evidence

#### Scenario: 恢复身份无法证明
- **WHEN** descendant含merge、缺少或冲突的Buildr provenance trailer、HEAD不是baseRef的ancestor后继、working tree含无法归属内容、local与remote不一致，或current run successor的run/plan trailer不匹配
- **THEN** runner MUST在Git、安装与finalize副作用前blocked并返回实际identity与唯一人工核对入口
- **AND** MUST NOT stash、reset、rebase、merge、force push、扩大owned scope或接受任意clean descendant
