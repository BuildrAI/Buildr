## ADDED Requirements

### Requirement: Buildr Release Skill必须消费统一发布编排结果
`buildr-release` MUST使用release orchestration runner推进merge后readiness、显式授权dispatch与Publication后closeout，同时继续把selection、transaction、Git convergence、Task Record、Task Environment和Doctor视为独立owner。Skill MUST在每次暂停或恢复时报告current action、context/timeline identity、已成立effects与唯一next action，不得用聊天摘要补造阶段或成功事实。

#### Scenario: readiness完成后请求唯一publication授权
- **WHEN** release→main已合并且orchestration `prepare-dispatch`返回current frozen context与`awaiting-publication-authorization`
- **THEN** Skill MUST向维护者展示该context digest和唯一publication授权决定并停止
- **AND** MUST NOT自动dispatch、把历史授权当作current授权或完成release Task

#### Scenario: 授权后dispatch发现context漂移
- **WHEN** 维护者授权的expected context digest与dispatch时重新读取的current context不一致
- **THEN** Skill MUST保持同一active release Task并返回readiness owner的blocked事实
- **AND** MUST NOT重建近似context、沿用旧授权或dispatch第二workflow

#### Scenario: Publication后恢复closeout
- **WHEN** Publication已成立但reconciliation、release resource closeout、Task completion、Environment cleanup或Doctor尚未完成
- **THEN** Skill MUST以同一orchestration identity只恢复尚未完成的owner步骤
- **AND** MUST NOT重跑Publication、撤销已成立effects或创建resume/finalize协调Task
