## ADDED Requirements

### Requirement: 开发收尾必须消费明确的远端清理政策
收尾技能（Skill）MUST在交付后核对当前任务创建或使用的远端分支（Branch），只在当前用户授权或明确适用于当前仓库的持续授权覆盖删除时执行。通用“收尾”本身 MUST NOT被解释为远端删除授权。仓库自行声明的常驻引用 MUST保留。没有远端协作需求时，智能体（Agent）MUST不为完成收尾而创建临时远端引用。

#### Scenario: 直接交付开发主线
- **WHEN** 任务未经过合并请求（Pull Request），已完成直接交付且仓库政策授权清理本任务临时引用
- **THEN** 智能体（Agent）MUST核对精确归属、交付保全、无活动用途和实时提交后条件删除并回读
- **AND** MUST不把GitHub合并后自动删除设置当作已经完成清理的证据

#### Scenario: 合并后自动删除
- **WHEN** GitHub已删除合并请求（Pull Request）的临时引用
- **THEN** 收尾 MUST核对实际合并与远端不存在并复用该事实，不重建或重复删除

#### Scenario: 保留必要工作和报告残留
- **WHEN** 引用有未交付内容、开放合并请求（Pull Request）、未结束运行、漂移或归属未知
- **THEN** 收尾 MUST保留相关对象并逐项说明原因，继续其他安全工作
- **AND** MUST分别说明已删除、已不存在和仍保留项，不以任务完成或笼统cleaned替代远端观察
