## ADDED Requirements

### Requirement: Task Verification 报告必须在任务 active 期间登记
Task Verification Report 写入 MUST 要求 Task 当前为 `active`；`completed` 及之后槽位 MUST 不再接受新报告并返回明确诊断。实现完成阶段已执行且适用于当前内容的检查 MUST 在该时点登记，而不是留到任务 completed 之后再补写。

#### Scenario: completed 后拒绝补登记
- **WHEN** Agent 在 Task 已 `completed` 后尝试 `task verification record`
- **THEN** Application MUST 拒绝并说明 Task 已终态
- **AND** 原 current 报告（如有）保持不变

#### Scenario: 实现完成后登记
- **WHEN** Task 仍为 `active` 且实现阶段相关检查已按适用性完成
- **THEN** Agent MUST 在实现完成阶段登记正式报告
- **AND** 后续收尾或完成动作不因缺失报告而重复创建检查事实，也不得把报告补救到已完成任务

## MODIFIED Requirements

### Requirement: Task Verification必须维护一份独立完成报告
Buildr MUST为每个正式Task维护至多一份current `buildr.task-verification-report/v1`。报告MUST绑定Task ID、Task scope、内容版本、当前Project测试地图identities、实际checks、gaps、整体结论和完成时间；MUST NOT绑定Candidate、generation、lease、Development policy、gate、decision、handoff或Task完成状态。每次写入MUST以该时点任务相关的完整检查集合更新current报告，而不是只记录相对上次的新增部分。

#### Scenario: Agent保存开发完成后的报告
- **WHEN** Agent完成任务相关测试与适用低成本完整回归，并提交包含实际checks或明确gaps的完整报告
- **THEN** Application MUST校验Task、scope、内容版本、测试地图和closed report shape后原子替换current报告
- **AND** MUST返回保存结果而不是测试进程运行结果

#### Scenario: 增量完善后的报告覆盖整体相关检查
- **WHEN** Agent在既有检查之外又完成新的相关检查并重写current报告
- **THEN** 新报告 MUST包含该时点任务相关的全部适用检查
- **AND** MUST NOT只提交本次新增的检查项冒充完整验证

#### Scenario: 开发过程中的临时测试
- **WHEN** Agent只是在开发过程中运行focused测试或修复反馈
- **THEN** Agent MUST NOT写Task Verification Report
- **AND** Application MUST不提供逐次run、attempt或history记录入口
