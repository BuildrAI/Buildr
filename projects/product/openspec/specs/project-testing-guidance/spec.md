# project-testing-guidance Specification

## Purpose

定义无状态 Project Testing Skill，指导 Agent 基于 Project / Service 真实技术栈建立测试边界、事实 owner 与 Quick / Task-affected / Candidate / Release 编排；不创建测试结果、持久状态或通用 QA 平台。

## Requirements

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

### Requirement: Project Testing 必须建立最小测试质量闭环
Agent 在设计或开发测试时 MUST 将每项关键待证明事实映射为公共可观察结果，并按变更风险选择能够区分正确与错误实现的正常、失败、边界和必要状态转换案例；随后 MUST 选择能够证明这些结果的最低充分执行边界。Agent MUST 说明关键遗漏或不适用情况，不得用目录、测试名称、单一成功案例或覆盖率数字代替行为证据。

#### Scenario: 纯逻辑包含失败与边界行为
- **WHEN** 一项纯逻辑变更同时定义正常结果、非法输入和边界值行为
- **THEN** Agent MUST 在 Unit 边界覆盖能够区分这些行为的最小关键案例
- **AND** MUST NOT 只保留一个正常输入案例并声称目标事实已充分证明

#### Scenario: 验收标准映射为可观察结果
- **WHEN** proposal、需求或 design 给出明确验收标准
- **THEN** Agent MUST 将适用标准映射为可观察结果和 Acceptance cases，或明确记录当前自动化 gap
- **AND** MUST NOT 仅因已有技术 smoke 就宣称验收标准已覆盖

### Requirement: 新增测试必须提供可信有效性证据
新增测试 MUST 断言由事实 owner 对外可观察的行为，并 MUST 能够在目标错误存在时失败。Bug 回归测试 MUST 说明其捕获的旧错误，并在安全可行时通过修复前行为、受控错误实现或移除修复后的对照证明测试可证伪；无法安全取得对照时 MUST 报告替代证据与 gap，不得伪造失败历史。

#### Scenario: Bug 回归测试证明旧错误
- **WHEN** Agent 为可安全复现的 Bug 增加回归测试
- **THEN** 测试 MUST 在旧错误存在时失败并在当前修复下通过
- **AND** Agent MUST 报告该对照证据而不是只报告当前测试通过

#### Scenario: 旧行为无法安全执行
- **WHEN** 运行旧实现会产生破坏性副作用、成本不可接受或环境不可恢复
- **THEN** Agent MUST 使用当前失败复现、受控替代实现或精确人工推导作为替代证据并报告 gap
- **AND** MUST NOT 为取得红灯证据执行越权或危险操作

### Requirement: 替身与有状态测试必须保持事实真实性
mock、fake 或内存实现 MUST 只隔离外部协作者或不属于当前主要事实 owner 的边界，不得复制被测算法后以相同实现验证自身。测试 MUST 优先断言公共结果；只有交互协议本身属于待证明契约时才断言调用参数、顺序或次数。涉及持久状态、共享状态或外部副作用时，Agent MUST 按风险验证隔离、必要幂等、失败后清理与重复运行。

#### Scenario: mock 不替代被测逻辑
- **WHEN** Unit 或 Component 测试需要替换外部协作者
- **THEN** Agent MUST 保留被测行为的真实实现并从公共结果判断正确性
- **AND** MUST NOT mock 被测决策后只验证预设调用发生

#### Scenario: 有副作用测试可以重复运行
- **WHEN** 测试写入文件、数据库、消息、缓存或共享配置
- **THEN** Agent MUST 证明测试隔离其状态并在成功或失败后满足项目约定的清理边界
- **AND** 在幂等属于目标事实时 MUST 验证重复执行不会产生额外错误状态

### Requirement: 共享 helper 改动必须优先运行最低成本兼容 canary
Agent 修改被多个 action、状态或公共入口复用的 validation/helper 时，Project Testing guidance MUST要求先检查完整调用面，并从现有 tests 与可用 changed-plan reasons 中选择至少一个能证明既有公共行为的最低成本兼容 canary。focused regression MUST作为 Development feedback，且 MUST NOT替代最终 Task-affected 或 Candidate Formal Verification authority。

#### Scenario: 通用必填字段 helper 覆盖多个 action
- **WHEN** 一次变更收紧共享 required-field helper，但需求只针对部分 action
- **THEN** Agent MUST检查其他调用 action 的既有错误类型、诊断顺序或公共结果
- **AND** MUST在扩大到完整 System group 前优先运行一个已存在且能够区分兼容回归的最低成本 canary

#### Scenario: changed plan 提供 owner reasons
- **WHEN** Project 的 plan-only 输出已经把共享 owner 映射到受影响测试并提供 reasons
- **THEN** Agent MUST使用这些 reasons 选择 focused canary并说明其覆盖的旧行为
- **AND** MUST不把 plan preview 或 canary 结果冒充 Formal Verification Result

#### Scenario: 单个 canary 无法证明调用面
- **WHEN** 调用面检查发现多个独立公共边界，且一个既有测试不能覆盖主要风险
- **THEN** Agent MUST按最低充分原则扩展 focused regression
- **AND** MUST不为了追求固定低耗时而遗漏已识别兼容路径
