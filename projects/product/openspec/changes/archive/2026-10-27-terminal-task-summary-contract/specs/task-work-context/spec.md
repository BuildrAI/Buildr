## ADDED Requirements

### Requirement: 终态任务仍可补写工作摘要内容
系统 MUST 允许在任务进入终态后继续补写当前工作摘要的进展、下一步与当前节点；该写入 MUST NOT 改变任务状态、结果与终态事实。命令行（CLI）帮助 MUST 与实际写入边界一致，MUST NOT 宣称终态任务整体不可修改。

#### Scenario: 终态补写最后进展
- **WHEN** 调用方按当前版本为已结束任务写入进展、下一步或当前节点
- **THEN** 应用 MUST 接受该写入并返回新版本
- **AND** 已结束任务的检查适用性结论 MUST NOT 因此被改写

#### Scenario: 终态补写不改动任务事实
- **WHEN** 调用方为已结束任务补写工作摘要内容
- **THEN** 任务状态、结果与终态事实 MUST 保持不变
- **AND** 既有摘要内容 MUST 保留，除本次明确提交的字段外不被清空

#### Scenario: 命令行帮助与实际边界一致
- **WHEN** 用户或智能体读取 `buildr task work-context` 帮助文本
- **THEN** 帮助 MUST 说明终态任务仍可补写进展、下一步与当前节点
- **AND** 帮助 MUST 说明检查适用性结论在终态后不可再修改
- **AND** 帮助 MUST NOT 宣称终态任务整体不可修改
