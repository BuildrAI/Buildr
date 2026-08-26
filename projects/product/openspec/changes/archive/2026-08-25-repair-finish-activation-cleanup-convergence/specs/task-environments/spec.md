## ADDED Requirements

### Requirement: Environment cleanup 必须消费可重建的已交付贡献证明
Task Environment MUST允许已完成的自动Finish或Delivery Reconciliation提供从冻结Task Contribution、当前Task checkout、delivery carrier/target Git objects与remote containment重建的cleanup proof。旧run缺少新投影字段时，只要provider能独立复算Task source tree、贡献identity与delivered target等价，MUST允许清理精确Task-owned worktree、branch与provider evidence；任一source drift、未知path、remote不包含或identity不匹配仍 MUST fail closed。

#### Scenario: 隔离carrier交付后的历史Task worktree
- **WHEN** Task worktree仍停在原baseline并包含完整dirty Task Contribution，remote target包含matching delivered carrier，且provider独立复算source tree与贡献identity完全相等
- **THEN** Environment cleanup MUST将该checkout视为integrated并清理精确Task-owned worktree、branch和provider evidence

#### Scenario: 历史proof不可重建
- **WHEN** Task source、baseline、carrier、target ref或贡献identity任一缺失、漂移或不匹配
- **THEN** Environment cleanup MUST保留现场并返回精确不匹配诊断，MUST NOT通过Task completed或调用方claimed success放行

### Requirement: Environment与Carrier cleanup结果必须保持正交
Task Environment MUST只拥有Task checkout、Preparation资源与Environment Receipt cleanup；它 MUST NOT删除Finish carrier。Finish MUST在Environment cleanup返回attention时仍独立处理其owned carrier，并分别维护Environment与carrier disposition。任一cleanup失败 MUST NOT撤销已确认Delivery，也 MUST NOT把另一owner的cleanup结果改写为成功。

#### Scenario: 两类cleanup一成一败
- **WHEN** Environment cleanup与carrier cleanup中只有一个通过
- **THEN** Finish maintenance MUST分别投影两个真实结果并保留失败owner的唯一恢复动作，不得合并为单一cleaned或blocked结论
