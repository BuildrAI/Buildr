## ADDED Requirements

### Requirement: OpenSpec Change checklist 必须止于 Change disposition 边界
Buildr-owned OpenSpec propose、update与apply contributions MUST引导Agent只把Change disposition前可完成的实现、知识收敛、验证反馈和archive readiness动作写入`tasks.md`。Contributions MUST NOT把Formal Development、Task Finish、Metadata Publication、Environment cleanup、Task terminal state或其他只能在archive后发生的Task lifecycle动作写为Change checkbox；convergence/archive MUST在Task Development观察stable Content Target之前完成，Task Finish MUST不拥有或解释Change checklist。

#### Scenario: Agent创建或修订Change计划
- **WHEN** `openspec-propose`或`openspec-update-change`生成或修改`tasks.md`
- **THEN** Buildr contribution MUST要求每个checkbox都能在Change disposition前完成
- **AND** MUST排除Formal Development、Finish、publication、cleanup与terminal动作

#### Scenario: Agent准备收敛Change
- **WHEN** `openspec-apply-change`完成实现并准备调用`buildr openspec converge`
- **THEN** contribution MUST要求先完成全部Change-owned checkbox并说明convergence/archive属于Development stable Content Target之前的Change处置
- **AND** MUST NOT声称Task Finish调用或拥有convergence/archive
