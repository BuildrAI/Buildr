## ADDED Requirements

### Requirement: 生命周期 read model 必须保存 terminal association snapshot
Task lifecycle current read model MUST 支持保存和读取 terminal association snapshot，并保持它与专业 Development、Review、Verification current record 分离。snapshot 缺失时 reader MUST 返回稳定缺失语义，MUST NOT 在 GET 中执行 mutation 或 live observation。

#### Scenario: 读取保存的 terminal association
- **WHEN** Local App 或其他 reader 请求已完成 Task 的终态交付投影
- **THEN** Application MUST 从 lifecycle current read model 读取 terminal association snapshot
- **AND** MUST NOT 为该请求调用 Git、Environment、Finish scan 或专业 gate recomposition

#### Scenario: Finish 写入冻结关联
- **WHEN** Task Finish 已以 current handoff 完成 durable delivery
- **THEN** lifecycle current read model MUST 保存该 handoff、Candidate 与三个 gate 在交付时采用的最小 identity/digest 关联
- **AND** MUST NOT 复制专业 Result 正文或重新拥有其 authority

#### Scenario: 无可证明历史关联
- **WHEN** 已完成的历史 Task 没有 terminal association snapshot
- **THEN** reader MUST 返回明确的 unproven 或 unavailable 诊断
- **AND** MUST NOT 扫描 Finish 目录、Git、Environment 或旧文件来回填关联

#### Scenario: 关联投影失败
- **WHEN** durable completion 后无法写入或校验 terminal association projection
- **THEN** Finish MUST 返回可诊断的 blocked 或 failed 结果
- **AND** MUST NOT 将该次运行报告为完整成功交付
