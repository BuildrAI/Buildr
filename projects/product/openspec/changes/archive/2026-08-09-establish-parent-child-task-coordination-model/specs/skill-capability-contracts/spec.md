## ADDED Requirements

### Requirement: 现有 capabilities 必须扩展最小协作保证
Task Record、Development、Review与Finish contracts MUST分别保证顶层关系/状态、Parent Plan与Contribution Handoff、identity applicability、terminal handoff association；MUST NOT创建第二套Parent coordination Result/store或把全部Skills互相声明为依赖。

#### Scenario: capability graph 验证
- **WHEN** package验证解析更新后的providers/consumers
- **THEN** selected bindings MUST保持ready且major版本与新保证一致
- **AND** graph MUST不包含lifecycle/progress/event store provider

### Requirement: 顶层Parent coordination入口必须可发现且不歧义
如果Parent coordination成为独立capability，默认provider description MUST覆盖inspect/record/reconcile/final acceptance用户意图，并与Task Manager顶层记录意图区分；binding ready MUST NOT替代routing验证。

#### Scenario: 用户说reconcile Parent Plan
- **WHEN** Agent进行入口匹配
- **THEN** MUST选择Parent coordination provider而不是直接写Task Record或Development store
- **AND** provider MUST通过Applications调用专业authority
