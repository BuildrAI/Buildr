## MODIFIED Requirements

### Requirement: 候选版准备Task必须覆盖完整准备结果并与support交付分离
Buildr Release workflow MUST让唯一`release-<version>` Task表达维护者要求的完整发布生命周期，并将需要在Candidate前独立完成Development、Verification与Finish的版本材料、测试修复或owner修复建模为窄release support Task。协调Task MUST从selection持续保持active到Publication、post-publication dev provenance reconciliation与必需closeout完成；support Task terminal、Task Finish delivery、self-bootstrap activation、单次Candidate运行或readiness通过 MUST NOT单独使release Task completed。

#### Scenario: release材料需要在Candidate前交付
- **WHEN** package version、CHANGELOG、README、测试修复或release owner修复必须进入当前release集合
- **THEN** Agent MUST在基于current `dev`的独立support Task worktree完成该内容自己的Development、Verification、Finish与适用self-bootstrap
- **AND** delivered dev commit MUST再以`cherry-pick -x`选择到既有release集合；Agent MUST NOT直接在release worktree修复后把整条release历史合并回dev

#### Scenario: Candidate失败
- **WHEN** current release source的完整Candidate aggregate失败、缺失或与selection identity不匹配
- **THEN** release Task MUST保持active或blocked并报告失败run/source和同一Task恢复动作
- **AND** Agent MUST NOT调用release Task Finish/complete、把support delivery当成发布完成或创建第二个同version协调Task

#### Scenario: 候选版准备达到授权终点
- **WHEN** current release selection已冻结、完整Candidate aggregate通过、唯一tarball成立、release→main tree相等且dispatch-check readiness以`effects: []`通过
- **THEN** release workflow MUST保持同一协调Task active并报告等待current frozen context的publication授权
- **AND** Task状态、Candidate通过或历史授权 MUST NOT替代维护者本次明确授权

#### Scenario: publication和必需closeout完成
- **WHEN** protected transaction、正式readback、matching dev provenance reconciliation与全部必需local/intermediate closeout成立，且正式远端release ref已按本轮授权完成保留或安全清理并核验
- **THEN** Agent MAY以no-change完成唯一`release-<version>`协调Task并报告完整发布与closeout事实
- **AND** 新发布授权 MUST明确包含本轮正式发布分支及临时分支清理；旧授权缺少该政策时 MUST保留原行为，不要求第二协调Task

#### Scenario: 历史release Task被提前完成
- **WHEN** 旧版本在本Requirement生效前已有错误terminal协调Task
- **THEN** Agent MUST保留历史记录，不得改写SQLite、伪造Task reopening或把旧事实迁移为current
- **AND** 新的唯一Task约束 MUST适用于后续version，产品不得继续把resume、refresh或finalize作为正常恢复模型

### Requirement: Buildr Release Skill必须消费current lifecycle与closeout结果
`buildr-release` MUST按release lifecycle read model恢复同一version和Task，只在阶段需要时调用selection、Candidate、readiness、protected transaction、Git reconciliation与closeout owner。Skill MUST报告Publication与后续维护的正交状态，并 MUST NOT通过聊天摘要、Task标题或新建协调Task补造阶段。

#### Scenario: 等待授权后继续发布
- **WHEN** lifecycle为`awaiting-publication-authorization`且维护者明确授权matching context
- **THEN** Skill MUST展示本轮分支清理范围，并以同一Task、generation与context dispatch protected transaction，绑定已获授权的清理政策并继续跟踪后续阶段
- **AND** MUST NOT创建finalize Task、重新pack或沿用其他context授权

#### Scenario: main→dev或closeout受阻
- **WHEN** Publication已成立但dev provenance reconciliation或必需closeout返回blocked及recovery identity
- **THEN** Skill MUST保留同一active Task并从该identity恢复对应owner
- **AND** MUST NOT撤销Publication、写入dev、重跑已通过Candidate或创建resume Task
