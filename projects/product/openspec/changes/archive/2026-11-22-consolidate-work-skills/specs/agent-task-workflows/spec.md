## MODIFIED Requirements

### Requirement: 任务复盘必须由Agent按用户意图直接完成
用户明确要求复盘终态Task时，Agent MUST使用`task-manager` 的复盘指南读取当前事实、生成固定本机Markdown并通过Task Record登记。Task完成本身 MUST不自动提示、生成、登记或要求复盘。

#### Scenario: 用户在任务完成后要求复盘
- **WHEN** 用户明确要求复盘指定终态Task
- **THEN** Agent MUST直接组合Task、Git、代码、测试和适用专业结果形成文档
- **AND** MUST不调用独立Retrospective Application、内部Driver或统一流程门禁
