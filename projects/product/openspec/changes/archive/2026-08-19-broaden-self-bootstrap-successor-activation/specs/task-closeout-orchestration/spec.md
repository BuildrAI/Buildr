## MODIFIED Requirements

### Requirement: Runner 必须可从可重算事实幂等恢复
Runner MUST只根据同一Finish Result、retained Git/ref/remote、当前run/plan successor identity、当前sync输出、installer和Doctor事实判断fresh、fresh-descendant、resume或already-complete；MUST NOT创建持久化runner state。`plan.baseRef` MUST继续绑定Finish frozen ref；动态`activationBaseRef`只有在当前HEAD等于baseRef，或baseRef是当前HEAD的祖先、baseRef到当前HEAD无merge、working tree clean且HEAD与Finish绑定的精确remote/branch一致时才能前进。普通descendant commit的作者、工具与`Buildr-Task` trailer MUST NOT成为activation前置条件；runner MUST记录frozen ref、实际activation base与published linear descendant commits，并 MUST NOT据此声明descendant拥有Task、Verification、Review或Candidate身份。当前HEAD若是本run/plan trailer精确匹配的successor，其parent MUST作为activation base，remote只可等于parent或HEAD。无法证明上述Git、target或current-run identity时 MUST fail closed并保留现场。

#### Scenario: 重跑复用未push的successor commit
- **WHEN** retained HEAD是当前run/plan绑定的精确successor，其parent位于Finish frozen ref的已发布无merge线性descendant chain上、sync重算后tree clean且remote仍为parent
- **THEN** runner MUST复用已有commit并从push阶段继续
- **AND** MUST NOT重复commit、amend或重新stage无关内容

#### Scenario: Remote已经包含successor commit
- **WHEN** 本地successor commit满足当前run/plan且远端target回读已经等于该commit
- **THEN** commit与push阶段 MUST报告幂等passed并继续适用安装与finalize
- **AND** MUST NOT再次push或创建第二个successor commit

#### Scenario: 多个已完成Finish等待激活
- **WHEN** 当前Result的frozen ref之后存在一个或多个已push的人工、IDE、其他Agent或Buildr提交，全部形成无mergefirst-parent chain，retained HEAD与精确remote/branch一致且tree clean
- **THEN** runner MUST选择当前HEAD作为activation base，并按当前Result的frozen Task Contribution paths重算和执行自身去重plan
- **AND** MUST NOT要求这些commit携带`Buildr-Task`或closeout trailer，也不得为其补Task、空提交或伪造trailer
- **AND** 若sync产生delta，新successor MUST直接以该activation base为parent；后续Result MUST能把它作为可证明published descendant继续顺序收敛

#### Scenario: Buildr-owned descendant无需sync commit
- **WHEN** runner在可证明published descendant上执行当前Result且sync不适用或重算后没有delta
- **THEN** runner MUST不创建空successor commit，并继续适用安装、development entry identity与finalize
- **AND** MUST在结果中保留frozen ref、实际activation base与descendant commit evidence

#### Scenario: Successor tree 改变不复用旧研发证据
- **WHEN** actual activation base晚于Finish frozen ref且successor tree可能改变了任务内容
- **THEN** runner MUST只报告其在actual activation base执行的activation、development entry与Doctor事实
- **AND** MUST NOT把Finish frozen ref的Verification、Completion Review或Candidate宣称为successor的研发证据，也不得创建第二套adoption lifecycle

#### Scenario: 恢复身份无法证明
- **WHEN** descendant含merge、HEAD不是baseRef的ancestor后继、working tree含无法归属内容、local含未push descendant、local与remote不一致、remote再次漂移，或current run successor的run/plan trailer不匹配
- **THEN** runner MUST在sync、安装与finalize副作用前blocked并返回实际identity与唯一恢复入口
- **AND** MUST NOT stash、reset、rebase、创建merge、force push、扩大owned scope或接受任意未发布HEAD
