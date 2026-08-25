## MODIFIED Requirements

### Requirement: Lifecycle state 必须独立、可重建且 fail closed
Freeze、reopen、abandon和closeout MUST使用独立Git lifecycle refs与current owner facts，并保持幂等、compare-and-swap与授权边界。current freeze或abandon状态 MUST阻止update；只有显式reopen成功后才能继续逐commit update。Closeout MUST区分正式远端`release-<version>`、remote-tracking projection与owner-owned本地/中间资源：正式远端release ref默认保留并核验，本地release branch、全部selection lifecycle refs、owned worktree与generation carrier属于必需清理资源；remote-tracking ref存在 MUST NOT阻止本地清理。

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
- **WHEN** owner明确closeout一个已发布release，正式远端`release-<version>`精确等于冻结release commit，且本地branch、lifecycle refs或owned worktree仍存在
- **THEN** closeout MUST保留正式远端release ref，并在显式本地cleanup确认后删除owner可证明的本地branch、全部current/history lifecycle refs与owned worktree
- **AND** remote-tracking projection存在 MUST NOT阻止本地资源清理

#### Scenario: abandon and cleanup
- **WHEN** owner明确abandon一个未发布release集合
- **THEN** abandon MUST阻止后续Candidate/update/reopen且保留既有Git/Task事实
- **AND** 未取得独立cleanup授权时 MUST保留本地与远端资源

## ADDED Requirements

### Requirement: Release lifecycle 必须维持唯一协调Task与稳定恢复身份
Buildr MUST从current release owner facts派生version-scoped lifecycle read model，并 MUST让同一`release-<version>`协调Task从selection持续保持active到publication、main→dev与必需closeout完成。阶段与恢复身份 MUST绑定version、Task ID、selection generation/identity、frozen context digest和适用publish run，不得写入Task Record新状态字段或建立旁路workflow store。

#### Scenario: readiness完成并等待publication授权
- **WHEN** Candidate、唯一artifact、release→main tree equality与无副作用readiness全部current，但维护者尚未授权publication
- **THEN** lifecycle MUST返回`awaiting-publication-authorization`并保持同一release Task active
- **AND** MUST NOT完成Task、创建第二协调Task或把历史授权当作当前publication授权

#### Scenario: Candidate或publication暂态失败
- **WHEN** 同一version的Candidate失败、同SHA job暂态失败或protected transaction需要同context恢复
- **THEN** lifecycle MUST保留同一Task与匹配generation/context recovery identity
- **AND** support修复 MAY独立交付，但 MUST NOT成为新的release协调Task

#### Scenario: 必需closeout全部完成
- **WHEN** publication、main→dev与全部必需本地/中间资源closeout均通过，且正式远端release ref已按默认保留策略精确核验
- **THEN** lifecycle MUST返回`closed`并允许Release Skill完成唯一协调Task
- **AND** 可选的正式远端release ref删除未获授权 MUST NOT阻止Task完成

### Requirement: Release Git owner 必须管理generation carrier与幂等closeout
Release Git owner MUST为每个selection generation使用确定性`codex/release-main-<version>-g<generation>` carrier，记录expected commit、remote ref、PR head/base与ownership，并在main tree等价后枚举和删除owner可证明的本地/远端carrier。未知owner、ref漂移或多个不匹配PR MUST在删除或新PR mutation前失败关闭。

#### Scenario: 同version新generation创建PR
- **WHEN** 前一generation的release→main PR已经终结，而current frozen generation具有新的release HEAD/tree
- **THEN** owner MUST创建或复用current generation carrier并只以该carrier创建唯一受保护PR
- **AND** MUST保留正式远端`release-<version>`并拒绝复用旧generation carrier

#### Scenario: carrier closeout重复调用
- **WHEN** main tree已等于冻结release tree且matching carrier已经删除或仍精确指向expected release commit
- **THEN** closeout MUST分别返回`already-cleaned`或删除matching carrier并完成remote readback
- **AND** MUST NOT删除正式release ref、其他generation或ownership不明branch
