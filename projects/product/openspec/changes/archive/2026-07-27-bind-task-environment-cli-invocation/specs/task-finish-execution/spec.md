## MODIFIED Requirements

### Requirement: Task Finish 必须持有版本化 action registry
Buildr MUST 为全部标准 finish step 登记稳定 action entry，并为每个 entry 声明执行种类、适用条件、执行 surface、授权边界、effects、结果契约、evidence projection 与 fallback policy。Registry MUST 是 Task Finish application 的产品事实，不得要求 Agent 从 Skill 文本、cwd、`cliSource` 或历史命令猜测 execution plan。`product-executable` entry MUST 消费 task environment 已核验的结构化 CLI invocation，并将固定参数前缀与动作参数组合为确定 argv。

#### Scenario: 标准步骤均有登记动作
- **WHEN** 产品加载当前 finish plan
- **THEN** 每个 `FINISH_STEPS` identity MUST 至少解析到一个唯一 action entry
- **AND** contract test MUST 在新增 step 未登记时失败

#### Scenario: 登记动作生成执行计划
- **WHEN** 当前 step 匹配 `product-executable` entry 且所需 context 包含 receipt-bound CLI invocation
- **THEN** resolver MUST 使用 invocation 的绝对 command 与固定 args prefix 生成 cwd、argv、effect、assertion、evidence 和 fingerprint
- **AND** 调用方 MUST NOT 需要提供 `--execution-plans`、逐 step fingerprint 或重新推断 CLI 路径

#### Scenario: 历史 caller 仅提供 CLI source
- **WHEN** 迁移期间历史 caller 仍显式提供可执行的绝对 `cliSource`
- **THEN** resolver MAY 将其作为无固定参数前缀的兼容 invocation 使用
- **AND** 标准 task environment consumer MUST 使用 `cliInvocation`，Registry MUST NOT 根据 Workspace root 猜测默认产品路径
