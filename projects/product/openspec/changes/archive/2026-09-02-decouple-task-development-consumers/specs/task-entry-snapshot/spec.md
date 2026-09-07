## REMOVED Requirements

### Requirement: Formal Task 必须提供只读 compact entry snapshot
**Reason**: `task next` 把 Task、Environment、Development 与专业动作重新组织成统一流程入口，和 Agent 按目标发现 Skill 的产品原则冲突。
**Migration**: 使用 `task inspect`、`task environment inspect|prepare` 与当前专业 Skill/Interface 读取各自事实。

#### Scenario: 调用旧task next
- **WHEN** 调用方请求`task next`
- **THEN** CLI MUST返回unknown command且零副作用

### Requirement: Snapshot 必须区分硬前置与可调整建议
**Reason**: 统一 Snapshot 不再拥有跨专业 next action。
**Migration**: 每个专业动作只在自身 Skill 中说明必要安全前置和建议。

#### Scenario: 专业动作需要前置
- **WHEN** 专业动作缺少自身安全前置
- **THEN** 对应owner MUST返回局部诊断而不是Snapshot next状态

### Requirement: Snapshot 必须提供 action-local capability route
**Reason**: capability route 由真正消费该能力的 Skill 在动作发生时解析，不再由通用 Task 入口预先选择。
**Migration**: 直接使用对应 Skill 的 current binding 和 contract。

#### Scenario: Skill消费能力
- **WHEN** 专业Skill实际需要另一个capability
- **THEN** MUST在该动作上下文解析current binding

### Requirement: Snapshot 必须保留 execution root 与 writer provenance
**Reason**: Environment Receipt 已独占 execution root、controller 与 writer provenance。
**Migration**: 直接读取 Task Environment Application read model。

#### Scenario: 读取执行位置
- **WHEN** Agent需要受管execution root或writer
- **THEN** MUST从matching Task Environment读取

### Requirement: Snapshot profile 必须是 response-only 可观察事实
**Reason**: `task next` 退役后没有独立 profile surface。
**Migration**: 性能诊断归各专业 Application 与测试所有。

#### Scenario: 调查专业性能
- **WHEN** 维护者调查某专业Application成本
- **THEN** MUST使用该owner的测试或profile证据

### Requirement: Snapshot 不得建立第二 authority
**Reason**: 整个 Snapshot capability 退役。
**Migration**: 各 owner 的 read model 保持唯一 authority。

#### Scenario: 查看Task全貌
- **WHEN** 界面组合多个专业事实
- **THEN** MUST保持只读且不得保存聚合状态

### Requirement: 任务下一步指引不得编排收尾
**Reason**: `task next` 整体退役；收尾已由 `task-finish` Skill 独立发现。
**Migration**: 用户要求收尾时直接使用 `task-finish`。

#### Scenario: 用户要求收尾
- **WHEN** 用户表达完成或交付目标
- **THEN** Agent MUST直接发现`task-finish` Skill

### Requirement: 父任务指引必须独立于研发准备
**Reason**: 父任务管理已经由 `task-manager` 和 Task Record 独立承担，不需要 `task next` 再投影。
**Migration**: 使用 `task parent inspect` 和父任务完成接口。

#### Scenario: 用户查看父任务
- **WHEN** 用户查看整体目标或子任务成果
- **THEN** Agent MUST使用`task parent inspect`而不读取Snapshot
