## ADDED Requirements

### Requirement: 已核验交付必须可直接清理Task Worktree
Task Finish MUST允许Agent把已核验交付的逐仓完整source与delivered提交直接交给`worktree cleanup`。Worktree provider MUST只保护具体删除安全，不得要求Environment、旧Finish run、Task completed或原提交祖先关系证明业务等价。

#### Scenario: 不同提交编号的完整交付
- **WHEN** Agent已核验Task成果完整交付到另一个完整提交，且source checkout仍匹配观察值并保持clean
- **THEN** Worktree provider MUST在delivered提交仍由非任务retained ref持有时删除精确worktree、本地任务分支和evidence
- **AND** MUST NOT因为source提交不是delivered提交祖先而拒绝

#### Scenario: 删除前source发生变化
- **WHEN** source HEAD、dirty、registration或Worktree evidence在核验后发生变化
- **THEN** provider MUST拒绝对应删除并保留现场
- **AND** MUST NOT撤销或重做已成立的远端交付

#### Scenario: 多仓输入不完整
- **WHEN** expected-source与delivered-ref没有成对覆盖全部受管repository selectors
- **THEN** cleanup MUST在删除前blocked并指出缺失或未知selector
- **AND** MUST NOT扩大范围、猜测目标ref或删除已通过检查的其他Task资源
