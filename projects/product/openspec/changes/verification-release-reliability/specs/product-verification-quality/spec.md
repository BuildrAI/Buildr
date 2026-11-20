## ADDED Requirements

### Requirement: 精确的候选补验
候选补验 SHALL 复用同轮仍有效的通过证明，仅重新执行失败、缺失或可证明失效的检查。

#### Scenario: 单文件失败
- **WHEN** 同轮某文件失败且其他文件证明仍有效
- **THEN** 只补失败文件，不将其他文件重跑。
