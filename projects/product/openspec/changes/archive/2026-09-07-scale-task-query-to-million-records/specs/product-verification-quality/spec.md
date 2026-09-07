## ADDED Requirements

### Requirement: 百万级 Task 查询基准必须显式隔离且不进入日常门禁
Buildr Product MUST 提供 repository-owned 的显式百万级 Task query benchmark。该入口 MUST 只在调用方明确选择时于系统临时目录生成数据、运行查询并清理；MUST NOT 登记为 changed、core、candidate、release、Browser 或默认 npm test 的 step、dependency 或隐式 affected owner。

#### Scenario: 日常验证 Task query
- **WHEN** Fast、changed、core、candidate、release 或 Browser 验证覆盖 Task query 改动
- **THEN** 日常证据 MUST 使用小型行为 fixture 与查询计划断言证明正确性和索引路径
- **AND** MUST NOT 创建或复制百万条 Task fixture

#### Scenario: 显式运行百万级 benchmark
- **WHEN** 维护者明确运行 `benchmark:task-query-million`
- **THEN** runner MUST 在独立临时 Workspace/SQLite 中生成 1,000,000 条 Task 和代表性关系/搜索数据
- **AND** MUST 记录 Node、SQLite、平台、CPU、数据分布、数据库体积、准备耗时以及各查询的 cold/warm/P50/P95
- **AND** 成功或失败后 MUST 清理可证明由本次 run 创建的临时数据

#### Scenario: 解释性能结果
- **WHEN** benchmark 完成或某项观察值超过目标
- **THEN** 输出 MUST 分开报告查询正确性、查询计划、实际 timing 和目标差异
- **AND** MUST NOT 因单机环境波动把已通过的功能正确性改写为失败，也不得把一次快速结果宣称为所有未来查询模式永久无需优化
