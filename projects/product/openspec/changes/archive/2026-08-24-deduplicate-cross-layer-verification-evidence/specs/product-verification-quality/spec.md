## ADDED Requirements

### Requirement: 日常 Core 慢 owner 必须具有闭合 primary evidence map
Buildr Product MUST 从唯一 verification registry 为日常 Core 中的慢 Integration/System owner 派生 primary evidence map。每项 MUST 明确待证明事实、公共可观察结果、反例、证据角色和唯一 `primaryEvidenceOwner`；primary owner 不存在、多个 owner 同时声称同一主证据或 supporting owner 无法解析到 primary owner时，contract MUST在执行前失败关闭。

#### Scenario: 慢 owner 承担唯一主证据
- **WHEN** 日常 Core 中一个达到审计阈值的 Integration或System owner由自身承担公共事实主证据
- **THEN** evidence map MUST将其标为primary并输出公共结果和能使该owner失败的反例
- **AND** 同一公共事实 MUST不得存在第二个primary owner

#### Scenario: 重型 owner 只承担组合辅助证据
- **WHEN** 低成本owner已经以反例充分证明公共行为且重型owner只验证跨边界组合
- **THEN** 重型owner MUST引用唯一低成本`primaryEvidenceOwner`并标为supporting
- **AND** planner、报告或文档 MUST不得继续把该重型owner声明为相同事实的主证据

#### Scenario: 真实黄金边界不可替代
- **WHEN** owner的公共结果依赖真实CLI、Git、进程、Workspace初始化、迁移、Finish、自举或cleanup边界
- **THEN** evidence map MUST保留至少一个穿过该真实边界的primary owner并说明低层反例不能替代的原因
- **AND** Test Context、mock或缓存被测结果 MUST不得替代该主证据

### Requirement: changed选择审计必须分离selection amplification与owner成本
Buildr Product MUST提供只读且可重复的changed选择审计，复用权威 ownership mapping、planner与显式Git base/head，输出changed paths、直接owner、依赖扩张、最终step集合、scope mode、结构化Full reason和目标工作量。审计 MUST将选择放大与owner执行成本分开，不得把预算或单次总墙钟冒充根因。

#### Scenario: 普通变更保持affected
- **WHEN** 显式base/head的changed paths均有直接ownership且未修改execution graph authority
- **THEN** 审计 MUST列出每条路径的选择reason、直接primary owner、依赖step和最终step count
- **AND** MUST报告selection amplification而不得执行无关sibling重型owner

#### Scenario: 变更合法升级为Full
- **WHEN** changed paths修改step command、profile、dependency、resource、scheduler、executor或其他execution semantics authority
- **THEN** 审计 MUST报告`full`及对应结构化reason code和触发路径
- **AND** MUST区分该升级与缺失ownership或任意中央文件名猜测

#### Scenario: 评估验证慢因
- **WHEN** 维护者比较代表性普通任务和同tree Execution Record
- **THEN** 结论 MUST分别报告直接owner数量、最终step数量、selected owner目标/实测成本和资源等待
- **AND** MUST明确主要成本是affected选宽、必要owner过重、环境竞争或尚未证明

### Requirement: 日常 Core 必须排除 Release-only primary evidence
Buildr Product MUST维护闭合的日常 Core Release-only排除集合。tarball生成、package安装、Launcher、发布smoke、package parity、registry/readback及其他只证明冻结Candidate或正式Release artifact的owner MUST NOT具有日常`core` profile；Candidate、Host Node与正式Release authority及其覆盖 MUST保持不变。

#### Scenario: 构建日常 Core plan
- **WHEN** planner解析普通Task的日常Core或affected计划
- **THEN** tarball、安装、Launcher、发布smoke、package parity和registry/readback owner MUST不在计划中
- **AND** Candidate CI中名为`core-*`的macOS shard MUST不得被解释为日常Core membership

#### Scenario: 构建完整 Candidate或Release plan
- **WHEN** current frozen source执行Candidate、Host Node或正式Release验证
- **THEN** 被日常Core排除的Release-only owner MUST仍按既有唯一authority进入适用计划
- **AND** 唯一Candidate generation、tarball、Launcher和Release readback覆盖 MUST不得下降或被复制

### Requirement: 去重决定必须由反例与覆盖闭合证明
Buildr Product MUST在转移primary evidence、收窄changed ownership或移除日常Core membership前，证明替代低成本owner能通过确定性反例发现目标错误，并证明Candidate测试文件并集、唯一primary owner、代表changed paths和Release exclusions不退化。无法形成替代主证据时 MUST保留原owner并记录理由。

#### Scenario: 低层owner充分发现错误
- **WHEN** Unit、Component或Integration owner在故障反例下稳定失败且公共结果与候选重型owner相同
- **THEN** primary evidence MAY转移给该低成本owner
- **AND** 重型owner MUST仅保留不可替代的组合边界或从日常Core移除

#### Scenario: 低层owner无法覆盖真实边界
- **WHEN** 反例证明低层owner无法观察真实CLI、Git、进程或完整生命周期故障
- **THEN** 原重型owner MUST继续作为primary evidence owner
- **AND** 审计 MUST记录保留理由而不得为达到性能数字删除该owner

#### Scenario: 形成后续黄金owner输入
- **WHEN** 全部候选重复证据完成审计
- **THEN** 报告 MUST列出仍需真实执行的Finish、Workspace、Worktree、Candidate和进程owner及其当前基线
- **AND** MUST重新计算总目标工作量、依赖关键路径和资源容量数学下限，不预设无法由数学支持的硬预算
