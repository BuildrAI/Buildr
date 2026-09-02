## MODIFIED Requirements

### Requirement: Buildr Web Task 页面必须退出研发与旧交付历史
Buildr Web MUST以Task Record为任务目标和结果authority，按需读取Review、Verification、Parent facts与Task Record拥有的本机复盘文档。页面 MUST不请求或展示Development、Task Environment、Task Candidate、Handoff、Task Planning Identity、Terminal Delivery、旧Finish history或独立Retrospective Application。

#### Scenario: 查看没有Development的Task
- **WHEN** 用户打开任意todo、active、completed或abandoned Task
- **THEN** 页面 MUST正常展示概览、原型和证据
- **AND** 概览中的复盘卡片缺少登记时 MUST保持简单空态且不自动提示或写入

#### Scenario: 完成任务
- **WHEN** 用户通过现有Task Record动作完成Task
- **THEN** 页面 MUST展示Task Record保存的结果
- **AND** MUST不要求或查询Development、Environment、Finish history或Retrospective结果证明
