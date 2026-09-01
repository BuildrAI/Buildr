## MODIFIED Requirements

### Requirement: Lifecycle state 必须独立、可重建且 fail closed
Freeze、reopen、abandon和closeout MUST使用独立Git lifecycle refs与current owner facts，并保持幂等、compare-and-swap与授权边界。current freeze或abandon状态 MUST阻止update；只有显式reopen成功后才能继续逐commit update。Closeout MUST区分正式远端`release-<version>`、正式远端Tag、remote-tracking projection与owner-owned本地/中间资源：正式远端release ref和正式远端Tag默认保留并核验；本地release branch、全部selection lifecycle refs、owned worktree、generation carrier与本地同名Tag属于必需清理资源；remote-tracking ref存在 MUST NOT阻止本地清理。

#### Scenario: freeze and inspect
- **WHEN** open集合被要求 freeze
- **THEN** owner MUST写入current frozen ref与不可变`freezes/<generation>`历史ref，并返回包含按generation排序`freezeHistory`的stable selection identity；重复 freeze 在HEAD和历史ref未变时幂等成功
- **AND** branch内容变化、current frozen ref与HEAD不一致或历史generation ref漂移时read model MUST标记stale或blocked

#### Scenario: reopen current freeze
- **WHEN** current selection为frozen、worktree clean且维护者提供显式confirmation与非空reason
- **THEN** owner MUST确保当前generation历史freeze不可变保存，再按expected commit删除current frozen ref并返回`ready`
- **AND** update仍需后续独立授权；旧Candidate、artifact、readiness与transaction context MUST因current selection status/identity变化而stale

#### Scenario: reopen遇到ref竞争或错误状态
- **WHEN** selection不是current frozen、历史freeze ref指向其他commit、current frozen ref漂移、worktree dirty或confirmation/reason缺失
- **THEN** reopen MUST fail closed并报告current facts与已发生effects
- **AND** MUST NOT继续update、移动remote branch、删除历史freeze或自动改变策略

#### Scenario: 正式远端release ref存在时清理本地资源
- **WHEN** owner明确closeout一个已发布release，正式远端`release-<version>`精确等于冻结release commit，正式远端Tag与Publication evidence匹配，且本地branch、lifecycle refs、owned worktree或本地同名Tag仍存在
- **THEN** closeout MUST保留正式远端release ref和正式远端Tag，并在显式本地cleanup确认后删除owner可证明的本地branch、全部current/history lifecycle refs、owned worktree与本地同名Tag
- **AND** remote-tracking projection存在 MUST NOT阻止本地资源清理

#### Scenario: 本地Tag已缺失
- **WHEN** Publication evidence与正式远端Tag匹配，且本地同名Tag已经不存在
- **THEN** closeout MUST把本地Tag返回为`already-cleaned`
- **AND** MUST NOT重复创建、fetch、移动或删除远端Tag

#### Scenario: 本地或远端Tag漂移
- **WHEN** 正式远端Tag与Publication evidence不匹配，或本地同名Tag存在但与正式远端Tag对象不一致
- **THEN** closeout MUST在任何本地/中间资源删除前fail closed并报告expected/actual Tag identity
- **AND** MUST NOT删除、移动或覆盖本地或远端Tag

#### Scenario: abandon and cleanup
- **WHEN** owner明确abandon一个未发布release集合
- **THEN** abandon MUST阻止后续Candidate/update/reopen且保留既有Git/Task事实
- **AND** 未取得独立cleanup授权时 MUST保留本地与远端资源
