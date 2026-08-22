## ADDED Requirements

### Requirement: Release correlation必须只消费current Finish交付事实
Task Finish MUST继续独占Task Contribution、Delivery Carrier、remote containment、Delivery和维护投影；release correlation consumer MUST只读取matching current/terminal Finish read model及其稳定identity，MUST NOT要求Finish保存release selection、Product Candidate run、publish workflow、tag、npm或GitHub Release正文。Delivery、Activation、Environment Cleanup、Diagnostics与Publication MUST保持正交。

#### Scenario: 自动Finish交付release或support Task
- **WHEN** release correlation读取自动Finish形成的matching Delivery
- **THEN** consumer MUST核验Task、handoff、Candidate generation、Content Target、repository、remote ref和Finish result identity
- **AND** MUST只保存对该read model的portable引用/digest，不得复制Finish Result或直接读取其persistence

#### Scenario: Agent直接Git或PR后完成交付对账
- **WHEN** Task通过合法Git/PR路径交付并由Finish reconciliation形成Delivery
- **THEN** release correlation MUST接受与自动Finish相同的current read model不变量
- **AND** MUST NOT因没有自动Delivery Carrier而伪造、拒绝或降级已证明的Delivery

#### Scenario: 发布后维护失败
- **WHEN** Publication已经成功但Activation、Environment Cleanup或Diagnostics仍为attention、pending或failed
- **THEN** Finish MUST保持Delivery事实不变并按各owner投影真实维护状态
- **AND** release consumer MUST分别报告这些状态，不得把它们解释为Publication回滚或重写Task终态
