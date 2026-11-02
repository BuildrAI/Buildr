## ADDED Requirements

### Requirement: 执行归档保留已观察用量
系统 MUST 在执行移出当前轮或保留轮并归档到历史结果时保留已观察的 contextUsage，包括 usedTokens 和可选 windowTokens；MUST 保留既有后台代次信息。旧记录或未报告用量的执行器 MUST 保持用量未知，不填零或按字符猜测；上下文占用 MUST NOT 被解释为实际计费金额。

#### Scenario: 下一轮替换当前轮
- **WHEN** 已观察到用量的执行结束后开始下一轮
- **THEN** 持久历史结果仍保留原用量及代次，不被新轮覆盖

#### Scenario: 旧历史缺少用量
- **WHEN** 历史记录或执行器未提供contextUsage
- **THEN** 系统保持字段缺省，不制造用量或计费数据
