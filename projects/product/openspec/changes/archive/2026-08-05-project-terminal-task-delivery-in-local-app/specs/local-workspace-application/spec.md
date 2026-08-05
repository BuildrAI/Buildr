## ADDED Requirements

### Requirement: Local App 必须以 Application terminal projection 展示 Task 交付事实
Local App Task 详情 MUST 保持“概览、研发、证据、环境”四个一级页签，并 MUST 只通过 Application read model 获取 terminal delivery facts。HTTP/Web MUST NOT 直接读取 SQLite、扫描 Finish JSON、计算 identity、判断 currentness 或接受 target/root/path filesystem query。

#### Scenario: completed delivered Task
- **WHEN** terminal projection 返回 delivered
- **THEN** 研发页主结论 MUST 显示“已交付”，并展示交付时 Task context、planning disposition、Content Target、verification policy、Candidate/generation 与 Development handoff
- **AND** MUST 展示 final commit/ref、完成时间与 Environment cleanup 为正常结果

#### Scenario: completed noChange Task
- **WHEN** Task completed 且 result.noChange 为 true
- **THEN** 页面 MUST 显示“已完成，无需交付变更”
- **AND** MUST NOT 要求或伪造 Finish Result

#### Scenario: completed Task 缺少匹配 Finish
- **WHEN** Task completed、非 noChange 且没有匹配成功 Finish Result
- **THEN** 页面 MUST 显示“已完成，但交付未经证明”
- **AND** MUST NOT 使用 delivered 的绿色成功语义

#### Scenario: terminal 证据视图
- **WHEN** terminal projection 返回 Review/Verification delivery association
- **THEN** 证据页 MUST 使用“已随交付候选采用”与“已随交付目标验证通过/未通过”等交付时文案
- **AND** MUST 将 live applicability 作为独立次要事实，不得混称“当前适用”

#### Scenario: 技术详情与单卡宽度
- **WHEN** 页面展示 SHA、digest、`workspace-sqlite:` locator 或单一 Verification Result
- **THEN** 技术标识 MUST 位于次要或可展开详情，Verification 单卡 MUST 使用合理最大宽度
- **AND** Agent 生成的原始 evidence 内容 MUST 保持原文，不由 Web 翻译或改写
