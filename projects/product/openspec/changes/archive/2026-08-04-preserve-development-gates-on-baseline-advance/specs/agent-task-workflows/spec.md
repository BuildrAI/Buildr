## ADDED Requirements

### Requirement: Task Development 必须区分任务贡献与交付基线适用性

Git-backed Task Development MUST把任务贡献（Task Contribution）作为 stable Content Target 的任务内容 identity，并把交付基线（Delivery Baseline）作为可前进但不自动改变任务内容的 Git 事实。Development 与 Finish MUST复用同一 canonical raw Git delta identity；当 Agent 已审视最新基线且无语义冲突、Task Contribution identity 未变并可确定性证明时，Content Target、Candidate、Verification Result、Completion Review、decision 与研发交接（Development Handoff）MUST保持 current，Candidate generation MUST不增加。Buildr MUST NOT以路径不重叠、clean apply 或贡献 identity 等价推断语义安全；语义判断继续由 Agent、Project 与既有 verification policy 承担。

#### Scenario: rebase 只引入无关交付基线前进

- **WHEN** current Development handoff形成后，Agent审视并执行的 rebase 只引入最新Delivery Baseline，且rebase前后Task Contribution canonical raw Git delta identity相同
- **THEN** Development inspect与observe MUST保持原Content Target、Candidate、Verification Result、Completion Review、decision与handoff current
- **AND** 后续freeze MUST复用原Candidate且不增加generation
- **AND** Finish MUST继续在最新Delivery Baseline上重建隔离Delivery Carrier，formal Verification执行数保持0

#### Scenario: 任务贡献或同路径基线事实变化

- **WHEN** rebase前后Task Contribution identity不同、Git应用冲突、before/after blob identity改变、可信repository/baseline无法解析，或Agent认为需要新的语义判断与验证
- **THEN** Development MUST fail closed并把Content Target或相应gates派生为stale/blocked
- **AND** MUST返回正常Task Development重新建立Verification、Candidate、Completion Review与handoff
- **AND** MUST NOT自动解决冲突、伪造等价、复用旧Result或创建第二套Candidate authority

#### Scenario: 真实 Development 到 Finish 的适用性覆盖

- **WHEN** Product验证目标分支前进后的Candidate复用
- **THEN** 测试 MUST使用真实Task Development Application形成并只读检查current gates与handoff
- **AND** MUST覆盖基线前进等价复用、贡献变化或冲突fail closed、generation不增加、Finish不重跑formal Verification及远端交付cleanup
