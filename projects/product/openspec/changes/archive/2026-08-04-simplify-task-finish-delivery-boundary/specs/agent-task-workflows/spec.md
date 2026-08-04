## MODIFIED Requirements

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
Task Finish workflow MUST把current Development handoff作为前置条件。只有Task Development Application报告原Task source、Task Context、verification policy、gate或handoff真实stale，或者Task Contribution source identity无法由原Task source复算时，当前Finish run才 MUST终止并回到Task Development。Delivery Baseline前进、Git机械应用冲突、Delivery Adaptation、target-race、retained activation或cleanup暂态阻塞 MUST NOT单独使Candidate/generation/Verification/Completion Review/decision/handoff失效；它们 MUST在run-owned Delivery Carrier与产品生成exact resume token边界内处理。Skill MUST NOT把修复原Task内容、重新Formal Verification、Completion Review或Candidate generation描述为Finish恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Development Application报告current handoff、source、context、policy或gate真实stale，且Task Finish result返回`failureClass: upstream-candidate-defect`或`nextWorkflow: task-development`
- **THEN** Agent MUST明确说明不再current的Development applicability fact
- **AND** MUST结束当前Finish run并回到Development重新建立必要的Content Target/gates/Candidate/handoff

#### Scenario: Git conflict进入Delivery Adaptation
- **WHEN** 原Task source与Development handoff仍current，但Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** Agent MUST只在匹配run-owned Delivery Carrier处理语义兼容，并以产品生成的current exact token恢复同一run
- **AND** MUST NOT修改或rebase原Task worktree、重启Development、生成Candidate或执行Formal Verification/Completion Review

#### Scenario: 只观察到路径不重叠
- **WHEN** Agent或产品只知道目标分支与任务修改路径没有重叠
- **THEN** Skill MUST NOT据此声称语义安全或绕过Project verification policy
- **AND** 只能继续消费产品返回的Git/identity equivalence facts与已有Development handoff决定

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** Finish发现原Task source或handoff真实stale，且用户没有明确授权继续研发修正
- **THEN** Agent MUST结束当前Finish并请求或使用已有授权进入Development workflow
- **AND** MUST NOT在当前Finish run修改原Task内容、接受风险或重跑Formal Verification
