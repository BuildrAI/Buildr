## ADDED Requirements

### Requirement: 当前 Task Finish 必须保持单一窄交付 adapter
Buildr MUST在只有一个真实交付 adapter 时直接使用当前 Product/Git adapter，并 MUST把通用 Task Finish 边界限制为current Development Handoff、Delivery Carrier preparation、carrier equivalence、delivery effects、cleanup eligibility与run/resume facts。Git remote、branch、fast-forward与push MUST留在Git delivery实现，Buildr sync/Doctor/CLI/Local App install MUST留在Product retained activation，Task-owned resource/provider cleanup MUST只由Task Environment Application执行。Buildr MUST NOT在第二种真实adapter、明确selection authority和独立E2E fixture出现前创建公共adapter registry、插件协议、第二capability graph或通用transaction/state-machine框架。

#### Scenario: 当前只有 Git direct-to-target adapter
- **WHEN** package与runtime只登记当前Buildr Product的Git direct-to-target delivery
- **THEN** Task Finish MUST直接选择该确定性Product adapter并执行固定五阶段
- **AND** MUST NOT要求调用方选择adapter kind、provider id、execution plan或未来delivery type

#### Scenario: Product retained activation适用
- **WHEN** Delivery Carrier改变runtime、默认CLI或Local App正式影响路径
- **THEN** 当前Product adapter MUST在deliver内执行适用的retained sync/Doctor/install并记录not-applicable或真实结果
- **AND** 通用Development handoff、Candidate或Task Environment schema MUST NOT获得Buildr/Git/Node/npm常量

#### Scenario: 没有满足条件的新交付路径
- **WHEN** non-Git、multi-repo、task-branch、PR、release或deploy没有同时具备真实consumer、持久目标、equivalence、authorization、cleanup eligibility与独立E2E fixture
- **THEN** 当前Change MUST保持这些路径未实现
- **AND** MUST NOT为Roadmap完整性预建selection、registry、receipt或兼容层

### Requirement: Blocked Task Finish 必须只返回一个当前恢复动作
Task Finish MUST根据current Development applicability与run-owned事实返回唯一`nextWorkflow`或`nextAction`。只有Task Development Application报告source、Task Context、policy、gate或handoff真实stale时 MUST返回`nextWorkflow: task-development`；Delivery Adaptation、target-race、retained activation或cleanup暂态阻塞 MUST保持同一run并只返回产品生成的current exact resume token及一个明确动作。

#### Scenario: Delivery Adaptation阻塞
- **WHEN** Task Contribution不能机械应用到最新Delivery Baseline但Development handoff仍current
- **THEN** result MUST只返回在run-owned carrier完成Agent review后以current token恢复同一run的nextAction
- **AND** MUST NOT同时返回Task Development rebuild、Candidate generation或formal Verification动作

#### Scenario: Development applicability真实stale
- **WHEN** Task Development Application报告current handoff不再适用
- **THEN** result MUST只返回`nextWorkflow: task-development`
- **AND** MUST NOT保留一个与Development rebuild竞争的Finish resume动作
