## ADDED Requirements

### Requirement: Task 概览必须按 Parent、Child 与普通 Task 差异化展示
Buildr Web MUST 只在 `parent-plan` mode 展示完整 Parent 核心主体；Child mode MUST 只紧凑展示 Parent 链接、所承接 work item 与 actual binding 状态；ordinary mode MUST 不渲染 Parent coordination、Contribution、Child 或相关空卡片；legacy mode MAY 显示紧凑兼容提示但 MUST NOT占据概览主体。

#### Scenario: 普通 Task
- **WHEN** Task 没有 Parent、没有 Child 且没有 Parent Plan
- **THEN** Overview MUST 不显示 Parent 专属模块或空 Parent 卡片
- **AND** MUST 保持普通 Task 的既有专业摘要与详情可用

#### Scenario: Child Task
- **WHEN** Task 有 Parent 且 Development 绑定一个或多个 Parent work item
- **THEN** Overview MUST 显示 Parent title/link、work-item priority/title/objective 与 binding 状态
- **AND** MUST 不显示完整 Parent outcome、全部 Contributions、架构决策或最终验收主体

### Requirement: Parent Overview 必须以完整计划为核心并折叠技术事实
Parent Overview MUST 默认依次突出 outcome/current next、全部 work item 的摘要与可选完整详情、architecture decisions 和 final acceptance。每个 work item MUST 可见 priority、title、objective、directions、dependencies、boundaries、expected Child 与 actual Child 状态；Task Record、schema/digest/storage、Environment 与其他技术 evidence MUST 默认折叠或保留在独立 Tab，缺失 Change/Child/blocker/evidence 时 MUST 不显示大块空卡片。

#### Scenario: Parent 有多个 work item
- **WHEN** Parent Plan 包含多个 priority、完整方向和依赖
- **THEN** UI MUST 以列表摘要供用户选择并展示选中项完整方向
- **AND** dependency 与 blocked reason MUST 使用 title 并保留稳定 ID

#### Scenario: 技术事实默认折叠
- **WHEN** 用户首次打开 Parent Overview
- **THEN** Task Record、record digest、schema、storage 与 Environment 技术事实 MUST 不占据 Parent 核心计划的默认展开区域
- **AND** 用户 MUST 仍可通过显式展开或既有 Tab 查看这些事实

