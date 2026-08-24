## ADDED Requirements

### Requirement: 候选版准备Task必须覆盖完整准备结果并与support交付分离
Buildr Release workflow MUST让唯一`release-<version>` Task表达维护者要求的完整候选版准备结果，并将需要在Candidate前独立完成Development、Verification与Finish的版本材料、测试修复或owner修复建模为窄release support Task。support Task terminal、Task Finish delivery、self-bootstrap activation或单次Candidate运行 MUST NOT单独使release Task completed。

#### Scenario: release材料需要在Candidate前交付
- **WHEN** package version、CHANGELOG、测试修复或release owner修复必须先进入`dev`并被选择到release集合
- **THEN** Agent MUST使用scope和intent明确的support Task完成该内容自己的Development、Verification、Finish与适用self-bootstrap
- **AND** `release-<version>` Task MUST保持active并通过release correlation引用support Task的current owner evidence

#### Scenario: Candidate失败
- **WHEN** current release source的完整Candidate aggregate失败、缺失或与selection identity不匹配
- **THEN** release Task MUST保持active或blocked并报告失败run/source和唯一恢复动作
- **AND** Agent MUST NOT调用release Task Finish/complete、把support delivery当成准备完成或创建第二个同version release集合

#### Scenario: 候选版准备达到授权终点
- **WHEN** current release selection已冻结、完整Candidate aggregate通过、唯一tarball成立、release→main tree相等且dispatch-check readiness以`effects: []`通过
- **THEN** release workflow MAY以这些current identities完成`release-<version>`协调Task并报告准备完成
- **AND** Task completed MUST NOT替代后续对同一frozen publication context的维护者明确授权

#### Scenario: 历史release Task被提前完成
- **WHEN** 同version release Task已错误completed但其intent对应的Candidate、main收敛或readiness尚未成立
- **THEN** Agent MUST保留该terminal记录与既有Finish事实，不得直接改写SQLite、伪造Task reopening或重建同名Task
- **AND** Agent MUST创建明确标识的active recovery Task承载剩余准备，关联旧Task与support facts，并在完成报告中披露该恢复边界
