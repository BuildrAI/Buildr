## MODIFIED Requirements

### Requirement: Project Testing 必须使用正交测试边界
Project Testing MUST 分别判断主要意图和执行边界。主要意图 MUST 使用 Development、Acceptance、Static Conformance、Delivery / Release；执行边界 MUST 使用 Static、Unit、Component、Integration、System。测试编排 MUST 另外分别回答成本约束、选择范围和验证目标/节点：Quick 只表示低成本高频反馈，affected/full 表示按影响面选择或完整选择，Candidate/Release 表示冻结候选或发布物节点。上述概念 MUST NOT 作为同一层级的互斥场景 taxonomy；`focus` MUST 只作为故障诊断或显式定向范围，不得表示交付完整性。

#### Scenario: 技术性 Workspace 生命周期测试
- **WHEN** 测试通过真实 CLI、Git 和 Workspace 验证完整技术生命周期，但未从需求验收标准派生
- **THEN** Skill MUST 将其识别为 Development 意图与 System 执行边界
- **AND** MUST NOT 仅因端到端执行形式将其称为 Acceptance

#### Scenario: 静态契约检查
- **WHEN** verifier 只检查 schema、文档、manifest 或源码结构且不启动被测系统
- **THEN** Skill MUST 将其识别为 Static Conformance 意图与 Static 执行形式
- **AND** MUST NOT 强行归入 Unit、Component 或 Integration

#### Scenario: 冻结 Candidate 选择 affected 范围
- **WHEN** 冻结 Candidate 的 changed paths 已被事实 owner 完整映射
- **THEN** Project MAY 在该 Candidate 节点执行全部 affected 证据
- **AND** MUST NOT 仅因验证目标名为 Candidate 就自动扩大为 full

#### Scenario: 选择机制自身变化
- **WHEN** changed paths 修改 registry、path mapping、planner、runner 或其他决定 affected 可信度的全局 owner
- **THEN** Project MUST 将受影响范围确定性扩展为 full
- **AND** MUST NOT 通过追加一个重叠 required Candidate capability 重复执行相同主证据
