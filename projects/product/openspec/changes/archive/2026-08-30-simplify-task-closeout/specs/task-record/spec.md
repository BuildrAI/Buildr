
## ADDED Requirements

### Requirement: 完成记录必须与机器交付证明分离
任务应用（Application）MUST复用当前结果字段保存已完成目标的真实摘要，保持对象身份、版本冲突和终态保护。`completed` MUST不被解释为自动验证了远端交付；缺少旧收尾关联 MUST不把正常完成贬为未证明或引导补造关联。

#### Scenario: 直接完成的任务
- **WHEN** 任务通过现有 complete 动作结束且没有收尾结果
- **THEN** 完成投影 MUST为 `completed`，保留 `delivered=false`、无机器验证关联，结果摘要由任务记录展示。

#### Scenario: 已有历史证明
- **WHEN** 任务有可匹配的历史交付关联
- **THEN** 系统 MUST继续如实展示历史已证明结果，不重写或删除它。

#### Scenario: 内部读取失败
- **WHEN** 已完成任务的旧收尾结果不可读
- **THEN** 系统 MUST保留 completed，提供独立诊断而不否定任务记录。

## MODIFIED Requirements

### Requirement: Task 交付终态不得被后续维护 attention 撤销
Task Record的`completed/noChange=false` MUST表达已经完成的任务结果；是否经过机器验证的交付 MUST由独立证据表达。retained activation、Environment cleanup、Finish transient cleanup或diagnostics retention的pending/attention MUST由专业read model独立展示，MUST NOT把已完成Task退回active、blocked或未交付。

#### Scenario: completed Task仍有cleanup attention
- **WHEN** Task已完成远端交付而Task Environment尚未安全清理
- **THEN** Task Record MUST保持completed，Task详情 MUST展示独立cleanup attention
- **AND** Agent MUST能继续处理清理且用户可以查看结果和进行任务复盘
