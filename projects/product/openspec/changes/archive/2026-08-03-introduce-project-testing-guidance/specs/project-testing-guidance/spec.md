## ADDED Requirements

### Requirement: Buildr 必须提供无状态 Project Testing 指导
Buildr MUST 交付名为 `project-testing` 的 Workspace Skill，在用户要求设计测试框架、划分测试边界、编排测试场景，或实现型任务需要开发项目测试时提供指导。该 Skill MUST 直接使用 Project / Service 已有事实，并 MUST NOT 创建 Result、Receipt、Application、provider contract 或自身持久状态。

#### Scenario: 为实现任务开发测试
- **WHEN** Agent 已完成一项功能实现并需要补充研发测试
- **THEN** runtime MUST 能发现并路由到 `project-testing` Skill
- **AND** Skill MUST 基于当前变更、风险和项目已有技术栈指导或实施适量测试

#### Scenario: 只讨论项目测试框架
- **WHEN** 用户要求分析测试分层和编排但未授权文件修改
- **THEN** Skill MUST 只返回分析与建议
- **AND** MUST NOT 写入项目测试、声明或任何 Project Testing 状态

### Requirement: Project Testing 必须使用正交测试边界
Project Testing MUST 分别判断主要意图、执行边界和编排场景。主要意图 MUST 使用 Development、Acceptance、Static Conformance、Delivery / Release；执行边界 MUST 使用 Static、Unit、Component、Integration、System；编排场景 MUST 使用 Quick、Task-affected、Candidate、Release。`focus` MUST 只作为故障诊断或定向选择操作，不得作为交付编排场景。

#### Scenario: 技术性 Workspace 生命周期测试
- **WHEN** 测试通过真实 CLI、Git 和 Workspace 验证完整技术生命周期，但未从需求验收标准派生
- **THEN** Skill MUST 将其识别为 Development 意图与 System 执行边界
- **AND** MUST NOT 仅因端到端执行形式将其称为 Acceptance

#### Scenario: 静态契约检查
- **WHEN** verifier 只检查 schema、文档、manifest 或源码结构且不启动被测系统
- **THEN** Skill MUST 将其识别为 Static Conformance 意图与 Static 执行形式
- **AND** MUST NOT 强行归入 Unit、Component 或 Integration

### Requirement: Project Testing 必须按待证明事实确定 owner
Project Testing MUST 以待证明事实和独立交付边界确定 `ownerScope`。单一 Service 的代码、公开技术契约或独立交付物可以判定的事实 MUST 归该 Service；跨 Service 行为、Project 治理资产、用户旅程及组合 Candidate / Release MUST 归 Project。关键事实 MUST 有一个 `primaryEvidenceOwner`，辅助证据 MAY 重叠但不得形成相互冲突的主门禁。

#### Scenario: Project 根声明 Service 能力
- **WHEN** Project 根的测试或声明验证一个 Service 可独立判定的公开技术契约
- **THEN** Skill MUST 将事实 owner 识别为该 Service
- **AND** MUST NOT 因文件位于 Project 根而改变测试实现所有权

#### Scenario: 跨 Service 用户旅程
- **WHEN** 测试覆盖多个 Service 共同组成的用户旅程或组合交付物
- **THEN** Skill MUST 将主要证据 owner 识别为 Project
- **AND** 各 Service 的局部测试 MAY 作为辅助证据保留

### Requirement: Project Testing 必须优先最低充分执行边界
Agent 在开发 Development Tests 时 MUST 先读取项目已有测试框架、脚本、CI、约定和相关变更，再选择能够证明目标事实的最低充分边界。纯逻辑 MUST 优先由 Unit 覆盖；单一有界组装和轻量上下文 MUST 优先由 Component 覆盖；真实进程、Git、数据库、HTTP、消息或文件系统边界 MUST 归 Integration；只有完整交付物或公共生命周期事实才 MUST 上移到 System。

#### Scenario: 纯逻辑可以同进程证明
- **WHEN** 变更行为可以在不启动真实进程、网络、数据库或 Workspace 的情况下完整证明
- **THEN** Agent MUST 优先添加或调整 Unit 测试
- **AND** MUST NOT 只用 Integration 或 System 测试替代该低成本证据

#### Scenario: 需要真实技术边界
- **WHEN** 待证明事实是 CLI argv、Git 操作、数据库协议或 HTTP 集成行为
- **THEN** Agent MUST 使用相应 Integration 边界
- **AND** MUST 保持该测试可由 Task-affected 或 Candidate 按真实成本选择

### Requirement: 第一版验收测试必须保持占位边界
Project Testing MUST 将 Acceptance 定义为从提案、需求或设计验收标准派生的业务证据。第一版 MAY 在提案或设计阶段识别验收案例和未来自动化边界，但 MUST NOT 自动建设通用浏览器、移动端、性能、安全或其他 QA 平台；没有需求来源和实际执行事实时 MUST NOT 宣称业务验收完成。

#### Scenario: 浏览器 smoke 没有需求来源
- **WHEN** Playwright 或其他浏览器测试只证明 UI 可以启动和完成技术性关键路径
- **THEN** Skill MUST 将其保持为 Development / System smoke
- **AND** MUST NOT 把它报告为正式 Acceptance evidence

#### Scenario: 提案包含验收标准
- **WHEN** 提案或设计给出明确业务验收标准
- **THEN** Skill MAY 记录对应测试案例与建议自动化边界
- **AND** 第一版 MUST 将超出当前任务授权的具体 QA 建设报告为后续工作
