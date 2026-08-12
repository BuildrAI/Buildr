## ADDED Requirements

### Requirement: Capability graph 必须消费已安装 Component 的结构化 dependency contribution
Buildr capability graph MUST只从 base consumer `requires`、enabled installed Component 的结构化 dependency contributions 和 Project capability context 计算依赖；它 MUST NOT解析 Skill 或 Contribution Markdown 来猜测 dependency edge。

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
