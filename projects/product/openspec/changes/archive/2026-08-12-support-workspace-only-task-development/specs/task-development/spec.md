## ADDED Requirements

### Requirement: Task Development 必须正式支持仅工作区 verification policy
Task Development MUST以Task Record中显式Project、Service所属Project与Change所属Project的确定性并集作为有效Project集合。只有该集合为空时，Application MUST允许policy保存空Project declarations，并 MUST要求唯一`scope: workspace` coverage gap、空capabilities与空overrides；有效Project集合非空时 MUST继续要求全部current Project declarations且拒绝workspace gap。

#### Scenario: 真正的workspace-only Task建立policy
- **WHEN** active Task没有Project、Service或Project-bound Change，matching ready Environment只提供workspace source，且Agent提交唯一workspace coverage gap
- **THEN** Development MUST形成绑定空declarations与该gap的稳定policy identity
- **AND** MUST不创建Project、declaration、capability、passed事实或第二authority

#### Scenario: Service或Change不能伪装workspace-only
- **WHEN** Task省略`scope.projects`但包含Service或Project-bound Change
- **THEN** Development MUST把所属Project纳入有效Project集合并要求其current declaration observation
- **AND** 空declarations或workspace coverage gap MUST被拒绝

#### Scenario: workspace policy派生current与stale
- **WHEN** 保存的workspace policy、Task有效Project集合与Content Target均未变化
- **THEN** Development MUST通过空declarations的纯值比较保持policy current
- **AND** Content Target变化 MUST使Candidate和handoff stale，新增Project/Service/Project-bound Change MUST使workspace policy stale并要求新的Project declarations

#### Scenario: workspace gap尚未形成Result
- **WHEN** workspace policy已记录coverage gap但Task Verification没有绑定同一Content Target、空declarations与workspace gap的current Result
- **THEN** Candidate freeze MUST blocked并返回Task Verification next action
- **AND** MUST不把policy gap本身解释为passed Result或合法waiver

#### Scenario: current workspace gap完成负向Verification
- **WHEN** Task Verification记录matching current `not-passed` Result及workspace gap
- **THEN** Development MAY在其他前置gate完整时freeze Candidate
- **AND** `proceed`与handoff仍 MUST绑定精确Verification Result digest、`scope: workspace`和明确授权source的风险接受，或使用现有明确gate disposition

#### Scenario: 旧Receipt保持兼容读取
- **WHEN** Workspace SQLite包含既有v1/v2/v3 Development Receipt或Project declarations非空的current policy
- **THEN** repository MUST按原兼容规则读取且 MUST不backfill workspace gap、迁移row或写旧File Store
- **AND** 新workspace policy MUST继续写入同一Task唯一SQLite current Receipt
