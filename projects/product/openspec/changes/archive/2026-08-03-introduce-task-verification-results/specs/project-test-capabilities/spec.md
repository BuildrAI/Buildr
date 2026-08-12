## REMOVED Requirements

### Requirement: Project 可以可选声明任意测试能力集合
**Reason**: v1 字段集合包含旧 lifecycle policy，需由 v2 最小声明整体替换。
**Migration**: 使用“Project v2 声明已有 Verification Capabilities”。

### Requirement: 测试声明区分成熟度、阶段与门禁强度
**Reason**: maturity、minimal/affected/candidate 和 enforcement 不再属于 Project capability identity。
**Migration**: 只声明 `requiredForDelivery`；其他选择由目标适用性与 consumer policy 决定。

### Requirement: 测试声明表达环境、副作用与授权边界
**Reason**: v1 shape 与 authorization 层级被收窄。
**Migration**: 使用 v2 可选 `environment`、`effects` 和 resource claims。

### Requirement: Agent 引导测试能力持续演进
**Reason**: Verification 不再自动发现、生成或提升测试成熟度。
**Migration**: 缺失能力只记录 coverage gap；测试建设作为独立交付任务。

### Requirement: 声明支持兼容增强与权威政策模式
**Reason**: augment/authoritative 会保留双 policy source。
**Migration**: v2 declaration 是该 Project 已声明能力的唯一结构化来源。

### Requirement: Project doctor 只校验存在的测试声明
**Reason**: 行为保留但输出字段需要移除 mode 并升级 schema。
**Migration**: 使用新的 v2 doctor requirement。

### Requirement: Project 验证声明必须显式表达资源处理策略
**Reason**: v1 把四类通用资源平台固化进首版 schema。
**Migration**: v2 只按真实能力保留可选 coordinated/external resources 与 claims。

## ADDED Requirements

### Requirement: Project v2 声明已有 Verification Capabilities
已登记 Project MAY 在自身根目录提供 `verification.yml`，且存在时 MUST 使用 `buildr.project-verification/v2`。每项 capability MUST 具有唯一 `id`、明确 `scope.project` 与 `scope.services`、`invocation`、`applicability`、非空 `proves` 和 boolean `requiredForDelivery`；可选 title、environment、effects 与 resource claims MUST 只在真实需要时出现。

#### Scenario: 声明 Project 与 Service scope
- **WHEN** capability 验证整个 Project 或指定 Services
- **THEN** `scope.project` MUST 等于当前 Project code
- **AND** `scope.services` MUST 为空数组表示 Project-wide，或只包含该 Project 已登记 Service codes

#### Scenario: 未知 lifecycle 字段
- **WHEN** declaration 包含 mode、maturity、stages、enforcement、dependsOn、supersedes、Candidate 或 assurance 字段
- **THEN** doctor 与 runner MUST 将声明判为 invalid

### Requirement: Invocation 必须引用既有且有界的验证操作
`invocation.kind` MUST 为 `command|agent`。command MUST 提供非空 argv 与不逃逸 Project root 的 cwd；agent MUST 提供非空、可移植的 bounded instructions。Buildr MUST 只引用已有命令、脚本、CI 对应本地入口或 Agent 操作，不得把 declaration 当作测试实现。

#### Scenario: command invocation
- **WHEN** capability 使用 `kind: command`
- **THEN** runner MUST 从 Project root 解析 cwd 并使用 Workspace Node binding 执行受支持的 node/npm/npx 入口
- **AND** cwd 逃逸或不存在时 MUST 在启动前失败

#### Scenario: bounded Agent invocation
- **WHEN** capability 使用 `kind: agent`
- **THEN** instructions MUST 明确有限操作与完成事实
- **AND** command runner MUST 不尝试自动执行该 capability

### Requirement: Applicability 与 proves 必须可解释
每项 capability MUST 通过相对 Project paths 和可选 semantic conditions 表达何时适用，并 MUST 通过一个或多个 portable `proves` 文本表达成功能证明什么。`requiredForDelivery` MUST 只表示该能力在适用时是否为交付所需，不得编码推进决定。

#### Scenario: 目标路径匹配
- **WHEN** target change paths 匹配 capability applicability paths
- **THEN** Skill 或 consumer MAY 将该 capability 选为适用
- **AND** Result MUST 记录实际执行事实而不是复制整份声明

#### Scenario: 没有匹配能力
- **WHEN** 当前目标没有任何声明能力能证明所需事实
- **THEN** Verification MUST 报告 coverage gap
- **AND** MUST NOT 自动修改 declaration 或测试实现

### Requirement: 环境、副作用和资源只按真实边界声明
capability MAY 声明运行所需环境、预期 writes、external systems、authorization 与 resource claims。resource catalog MUST 只允许当前 Project 实际使用的 coordinated 或 external boundary；external action MUST 要求显式 authorization。

#### Scenario: coordinated browser capacity
- **WHEN** 浏览器 capability 声明并请求容量有限的 coordinated resource
- **THEN** execution runner MUST 在命令启动前取得 claim 并在完成后精确释放

#### Scenario: 未被引用的资源
- **WHEN** resource catalog entry 没有任何 capability claim
- **THEN** doctor MUST 报告无效或冗余声明
- **AND** Product declaration MUST 删除该 entry，而不是把资源平台当作未来占位

### Requirement: Doctor 必须只读校验 v2 declaration
Project 没有 `verification.yml` 时 doctor MUST 零 finding；文件存在时 MUST 只校验 closed schema、Project/Service identity、路径、invocation、resource references 和 authorization，不得运行 capability 或探测测试环境。doctor result MUST 返回 Project、path、valid 与 capabilityCount，不得保留 mode。

#### Scenario: v2 declaration 有效
- **WHEN** 已登记 Project 提供有效 v2 declaration
- **THEN** doctor MUST 报告 `valid: true` 与实际 capabilityCount
- **AND** declaration bytes MUST 不被修改

#### Scenario: v1 declaration 仍存在
- **WHEN** Project 仍使用 `buildr.project-verification/v1`
- **THEN** doctor MUST 返回明确 schema invalid finding 与 v2 migration 指引
- **AND** MUST NOT 通过兼容 reader 接受旧字段
