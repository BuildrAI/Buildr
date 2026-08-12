## MODIFIED Requirements

### Requirement: Task context identity 必须绑定完整 Intent、scope 与 Change context
Application MUST 从 Task Record Application/persistence authority 取得 Task ID、intent、完整 Project/Service scope与0..N Change references，并结合 Development记录的每个 Change disposition派生可移植 `taskContext.identity`。Identity MUST NOT 绑定Task Record时间戳、本机路径或默认 Product/Service名称。调用方提交`converged` disposition时，Application MUST复用Task Record的Task-scoped Change read model，证明当前working copy存在且lifecycle为`archived`；不得信任调用方summary、路径、retained baseline或文件存在推断convergence。

#### Scenario: 多 Change Task context
- **WHEN** Task Record包含多个不同Project/Change references
- **THEN** context identity输入 MUST 对全部reference和disposition确定性排序并完整绑定
- **AND** 任一 reference新增、删除或disposition变化 MUST 使旧 Candidate/handoff失效

#### Scenario: 无 OpenSpec 的 code-only Task
- **WHEN** Task Record的Change references为空
- **THEN** Application MUST 接受明确的code-only context并派生稳定identity
- **AND** MUST NOT 创建、推断、选择或调用虚假Change/OpenSpec能力

#### Scenario: Task Environment 已归档 Change
- **WHEN** 调用方为关联Change提交`converged`，Task-scoped Change read model显示当前working copy已`archived`，但retained baseline仍为active
- **THEN** Application MUST接受该disposition并以working copy lifecycle形成current Task context
- **AND** MUST NOT要求retained checkout在Finish前同步或归档同一Change

#### Scenario: Change仍active却声明converged
- **WHEN** 调用方为关联Change提交`converged`，但当前working copy仍active、缺失、不可用或无法确定lifecycle
- **THEN** Application MUST返回稳定blocked诊断并保持原Development current值不变
- **AND** MUST要求先由OpenSpec专业流程完成deterministic convergence/archive，不得创建Content Target、Candidate或handoff

#### Scenario: 已形成Candidate后Change lifecycle漂移
- **WHEN** Receipt保存`converged`，但后续Task-scoped Change read model不再证明同一working copy为archived
- **THEN** Development currentness MUST派生Task context、Candidate与handoff为stale或blocked
- **AND** MUST NOT改写历史handoff、自动执行convergence或让Task Finish解释Change lifecycle
