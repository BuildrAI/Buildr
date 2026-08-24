## MODIFIED Requirements

### Requirement: Release生命周期动作必须独立授权且幂等
Release create、update、freeze、reopen、abandon和cleanup MUST分别核验current identity、owner与授权，MUST报告实际effects，且 MUST NOT将一个动作的授权扩大为另一个动作。重复调用只有在输入和live facts等价时才可返回幂等成功；共享ref删除和远端release branch cleanup MUST始终要求独立明确授权。

#### Scenario: 冻结current release
- **WHEN** 维护者要求对current release HEAD/tree形成Candidate
- **THEN** freeze MUST返回selection chain、release commit/tree、generation与历史freeze identity，并准确报告本地lifecycle ref effects
- **AND** release内容变化 MUST使旧freeze、Candidate、artifact、readiness和transaction context stale

#### Scenario: 重新打开失败Candidate对应的冻结集合
- **WHEN** 维护者已经从GitHub、Git tag、npm registry与protected workflow current facts确认尚无公开或不可逆publication，并明确授权重新打开current frozen release
- **THEN** release workflow MUST独立调用reopen，selection owner MUST核验current identity与显式confirmation/reason、保留历史freeze ref并释放current freeze
- **AND** reopen MUST不隐含update、remote push、Candidate执行、Task状态变化或公共发布副作用

#### Scenario: 已存在公开发布事实
- **WHEN** 目标version/tag/GitHub Release已经存在，或matching protected transaction已经开始tag、npm或GitHub Release公共mutation
- **THEN** release workflow MUST拒绝reopen并要求选择新version
- **AND** selection owner MUST NOT通过caller提交的publication布尔值、历史stdout或Task completed状态补造安全证明

#### Scenario: 放弃未发布集合
- **WHEN** 维护者明确放弃某个尚未公开发布的release集合
- **THEN** abandon MUST保留Task、Verification、Finish和Git已有事实并阻止该集合继续进入Candidate/publication
- **AND** MUST NOT自动删除local/remote ref或伪造cleanup成功

#### Scenario: 清理远端release branch
- **WHEN** 公开发布与恢复价值已核验完成且remote release ref仍存在
- **THEN** owner MUST展示精确ref、commit与已成立发布事实并等待独立删除授权
- **AND** 未获授权、ref漂移或ownership不可证明时 MUST保留remote ref

### Requirement: Lifecycle state 必须独立、可重建且 fail closed
Freeze、reopen、abandon、cleanup MUST使用独立 Git lifecycle refs，并保持幂等、compare-and-swap与授权边界。current freeze或abandon状态 MUST阻止update；只有显式reopen成功后才能继续逐commit update。cleanup MUST只清理本地资源，发现 remote matching ref 时必须拒绝。

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

#### Scenario: abandon and cleanup
- **WHEN** owner明确abandon或cleanup一个本地release
- **THEN** abandon MUST阻止后续Candidate/update/reopen且保留既有Git/Task事实；cleanup只在显式确认后删除本地branch与全部current/history lifecycle refs
- **AND** remote ref存在、ref漂移或确认缺失时 MUST保留资源并返回恢复动作
