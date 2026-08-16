# project-test-capabilities Specification

## Purpose
定义 Project 可选测试能力声明的模型、成熟度、执行阶段、门禁强度、授权边界与验证证据要求，使团队能逐步发现、试运行并确认稳定门禁，同时保持未声明项目的零配置兼容。
## Requirements

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
`invocation.kind` MUST 为 `command|agent`。command MUST 提供非空 argv 与不逃逸 Project root 的 cwd；agent MUST 提供非空、可移植的 bounded instructions。Buildr MUST 只引用已有命令、脚本、CI 对应本地入口或 Agent 操作，不得把 declaration 当作测试实现，也不得为所有capability隐式注入Node runtime。

#### Scenario: command invocation
- **WHEN** capability 使用 `kind: command`
- **THEN** runner MUST 从 Project root 解析 cwd 并按声明argv与当前受控执行环境启动命令
- **AND** cwd 逃逸、不存在或首个executable不可解析时 MUST 在启动前失败
- **AND** failure MUST只归属于该capability execution，不得把Workspace标记为不健康

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

### Requirement: Capability 声明指导必须核对真实测试边界
Task Verification 的声明指导 MUST 读取真实 Project / Service 测试、package 或 POM scripts、CI 和项目约定，并核对 invocation、scope、环境、副作用及可用的实际成本证据。指导 MUST NOT 根据 capability id、`fast`、`unit`、目录名或技术栈惯例推断执行成本和证明范围。

#### Scenario: 名称为 fast 的重型入口
- **WHEN** 现有入口名为 `fast`，但真实调用包含大量子进程、完整 Workspace 或端到端环境
- **THEN** 声明指导 MUST 如实识别其执行边界与成本风险
- **AND** MUST NOT 仅按名称把它推荐为高频低成本能力

### Requirement: Declaration 必须只暴露稳定能力接口
Task Verification 的声明指导 MUST 将 `verification.yml` 限定为少量、稳定、可独立选择的 Project / Service capability 接口，不得复制每个测试文件、内部 registry step 或 Project Testing 分类卡。测试意图、执行边界、编排场景和成本目标 MUST 保留在 Project 自身测试设计或 registry 中，不得扩展 `buildr.project-verification/v2` schema。

#### Scenario: Candidate 内部包含多个 step
- **WHEN** 一个稳定 Candidate 入口内部编排多个测试 step
- **THEN** declaration MAY 只声明该稳定 Candidate capability
- **AND** MUST NOT 因内部 step 数量创建等量 capability 或通用 DAG 字段

#### Scenario: 项目缺少适用测试
- **WHEN** 声明审查发现目标事实没有现有测试入口
- **THEN** Task Verification MUST 报告 coverage gap
- **AND** 测试建设 MUST 作为 Project Testing 或后续实现工作处理，不得在声明更新中暗中生成测试
