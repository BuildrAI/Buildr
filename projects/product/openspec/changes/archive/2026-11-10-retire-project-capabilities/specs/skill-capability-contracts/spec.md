## MODIFIED Requirements

### Requirement: Skill capability contract 使用独立身份和版本
Buildr MUST 将可组合 Skill 的能力契约与 Skill 资产身份分离，MUST 只从 workspace Skill registry 注册 contract definitions，并 MUST 使用稳定 capability id 和正整数 major version 表达兼容边界。

#### Scenario: 声明 capability contract
- **WHEN** workspace Skills manifest 声明一个 capability contract
- **THEN** manifest entry MUST 包含 namespaced capability id、version、description 和受管 contract 文档路径
- **AND** contract Markdown MUST 使用 `buildr.capability-contract/v1` frontmatter 自描述相同的 id 和 version
- **AND** contract 文档 MUST 定义 `Purpose`、`Consumer Obligations`、`Minimum Guarantees`、`Effects and Authorization`、`Result Evidence`、`Decision Points` 和 `Allowed Variations`
- **AND** contract MAY 包含非规范性的 `Examples`

#### Scenario: Contract frontmatter 与 manifest 不一致
- **WHEN** contract frontmatter 的 id 或 version 与 workspace manifest 注册断言不同
- **THEN** package check、doctor 和 render MUST 报告 contract identity integrity error
- **AND** Buildr MUST NOT 选择其中一份 identity 继续解析 provider

#### Scenario: Project 引用 capability contract
- **WHEN** Project 旧 `capabilities.yml` 声明 requirement、binding 或 applicability
- **THEN** Buildr MUST NOT 将其解析为能力配置，只通过 Doctor 提示退役
- **AND** Project MUST NOT 定义、复制或覆盖 contract 文档

#### Scenario: 同一 workspace 重定义 contract identity
- **WHEN** workspace 或 package 为相同 capability id/version 提供多个不同 contract definitions
- **THEN** Buildr MUST 报告 contract identity conflict
- **AND** Buildr MUST NOT 依据路径、Project context 或安装顺序静默覆盖既有 contract 语义
- **AND** 内部 provider 实现 Buildr contract 时 MUST 引用既有 identity，而不是复制同名 contract

#### Scenario: Contract 发生不兼容变化
- **WHEN** capability contract 新增或修改 normative clause，使原本合规 provider 变为不合规，或改变前置条件、允许副作用、授权、结果或失败语义
- **THEN** 维护者 MUST 增加 capability major version
- **AND** Buildr MUST NOT 把旧 version provider 视为新 version consumer 的兼容实现

#### Scenario: Contract 只做兼容澄清
- **WHEN** 维护者只修改文字澄清、非规范性 examples 或不收紧 `Minimum Guarantees` 的说明
- **THEN** contract MAY 保持原 major version
- **AND** 变更 MUST NOT 把 provider-specific command、algorithm 或 policy 提升为 normative requirement

#### Scenario: 普通独立 Skill 不参与 composition
- **WHEN** Skill 不被其他 Skill 组合且不需要成为可替换 provider
- **THEN** Buildr MUST 允许该 Skill 不声明 `provides` 或 `requires`
- **AND** capability framework MUST NOT 强迫所有 Skill 创建空洞 contract

### Requirement: Provider 通过 workspace registry 与业务上下文 binding 解析
Buildr MUST 从唯一 workspace Skill registry 解析 providers，并 MUST 使用 workspace default binding 或唯一兼容 provider 确定 provider，而不是使用 Project Skill source scope 继承。

#### Scenario: Project context 存在 binding
- **WHEN** Project 旧能力上下文为 required capability 声明 binding
- **THEN** Buildr MUST 忽略该绑定并给出退役诊断
- **AND** MUST NOT 改变工作空间 provider 选择

#### Scenario: 没有 Project binding 时使用 workspace default
- **WHEN** workspace 声明 default binding
- **THEN** Buildr MUST 使用 workspace default provider
- **AND** provider selection MUST NOT 依赖 Skill 安装顺序

#### Scenario: 无 binding 且只有唯一 provider
- **WHEN** 没有适用 binding 且只有一个兼容、已安装、runtime 可用的 workspace provider
- **THEN** Buildr MUST 自动选择该 provider

#### Scenario: 多个未绑定 providers
- **WHEN** 没有适用 binding 且存在多个兼容可用 providers
- **THEN** consumer readiness MUST 为 `blocked` 且 reason MUST 为 `ambiguous_provider`
- **AND** Buildr MUST 列出候选 providers，不得根据 Project 路径、builtin 或安装顺序选择

### Requirement: Capability graph 必须消费已安装 Component 的结构化 dependency contribution
Buildr capability graph MUST只从 base consumer `requires`、enabled installed Component 的结构化 dependency contributions 计算依赖；它 MUST NOT解析 Skill 或 Contribution Markdown 来猜测 dependency edge。

#### Scenario: Component dependency contribution 生效
- **WHEN** runtime resolver 成功组合目标 Skill 与 Component-owned dependency contribution
- **THEN** Doctor、render 和 runtime binding evidence MUST按 effective dependency 计算 required/optional readiness
- **AND** `ready`仍 MUST只表示结构可路由，不得冒充 provider behavior 或本次 action 成功

#### Scenario: Component 只包含行为说明
- **WHEN** fragment 正文提到另一个 Skill、capability、provider 或命令但 Component 没有结构化 dependency declaration
- **THEN** capability graph MUST NOT自动创建 edge
- **AND** package verification MUST在已知 builtin contract fixture 中检测正文硬停止条件与声明缺失，但运行时不得使用自然语言推断

#### Scenario: Dependency contribution 的 capability 不可解析
- **WHEN** declaration 结构有效但对应 contract、binding 或 provider 在当前 Workspace/scope 不可用
- **THEN** capability graph MUST按标准 missing/ambiguous/version/runtime/invalid-binding 语义报告目标 consumer
- **AND** Component validator MUST NOT通过 Skill id或description猜测 compatible provider

#### Scenario: 直接产品命令不受 Skill graph 伪保护
- **WHEN**用户或其他客户端绕过入口 Skill直接调用产品 CLI
- **THEN** capability graph MUST NOT声称已执行 Skill dependency 或满足 Task lifecycle facts
- **AND** CLI 必须由自身 Application 校验其产品级输入与文件事实；未被 CLI contract 要求的语义义务仍由入口 consumer 负责

## ADDED Requirements

### Requirement: 能力绑定仅允许工作空间作用域
Buildr MUST 将工作空间作为能力配置唯一作用域；旧项目配置 MUST NOT 改变能力图或投射绑定。

#### Scenario: 请求项目级绑定或解绑
- **WHEN** 客户端向 bind/unbind 提供项目 scope
- **THEN** MUST 在写入前明确报告项目能力上下文已退役
- **AND** MUST NOT 修改项目文件或工作空间绑定

#### Scenario: 旧项目配置与默认选择不同
- **WHEN** 工作空间存在默认绑定且项目旧文件包含另一 provider 或需求
- **THEN** 能力图和投射 MUST 只使用工作空间选择及依赖
- **AND** MUST NOT 产生项目消费者或跨项目绑定冲突
