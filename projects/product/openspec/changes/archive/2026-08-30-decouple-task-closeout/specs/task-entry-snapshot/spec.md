## ADDED Requirements

### Requirement: 任务下一步指引不得编排收尾
Task Entry Snapshot MUST不推荐 task finish 命令，不读取旧收尾执行事实，不输出收尾准入或恢复；研发就绪仅报告已有研发结果。验证执行继续由原验证能力校验。

#### Scenario: 研发完成
- **WHEN** 研发结果已就绪
- **THEN** 返回由智能体报告研发结果的建议，不启动或要求收尾

#### Scenario: 已有旧收尾异常
- **WHEN** 旧收尾记录存在阻塞
- **THEN** 不读取或传播其收尾阻塞
