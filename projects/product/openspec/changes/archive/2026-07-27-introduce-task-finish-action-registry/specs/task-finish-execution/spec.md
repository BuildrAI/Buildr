## ADDED Requirements

### Requirement: Task Finish 必须持有版本化 action registry
Buildr MUST 为全部标准 finish step 登记稳定 action entry，并为每个 entry 声明执行种类、适用条件、执行 surface、授权边界、effects、结果契约、evidence projection 与 fallback policy。Registry MUST 是 Task Finish application 的产品事实，不得要求 Agent 从 Skill 文本或历史命令猜测 execution plan。

#### Scenario: 标准步骤均有登记动作
- **WHEN** 产品加载当前 finish plan
- **THEN** 每个 `FINISH_STEPS` identity MUST 至少解析到一个唯一 action entry
- **AND** contract test MUST 在新增 step 未登记时失败

#### Scenario: 登记动作生成执行计划
- **WHEN** 当前 step 匹配 `product-executable` entry 且所需 context 完整
- **THEN** resolver MUST 生成固定 command source、cwd、argv、effect、assertion、evidence 和 fingerprint
- **AND** 调用方 MUST NOT 需要提供 `--execution-plans` 或逐 step fingerprint

### Requirement: Task Finish 必须区分登记 provider 与 Agent 推理 fallback
Registry resolution MUST 区分产品可执行动作、已登记的语义 provider handoff、缺少结构化输入和真正登记外行为。只有不存在唯一登记动作或执行进入登记外语义分支时，Task Finish MUST 返回 `agent-reasoning-required`。

#### Scenario: 标准语义 provider 动作
- **WHEN** 当前 step 的登记种类为 `agent-provider`
- **THEN** result MUST 返回 capability、provider action、所需输入/evidence、执行 surface 与继续方式
- **AND** MUST NOT 把该正常交接描述为命令未知或要求 Agent 猜测 CLI

#### Scenario: Registry 没有覆盖行为
- **WHEN** 当前 step、运行时分支或多个匹配结果无法由 registry 唯一处理
- **THEN** result MUST 返回 `agent-reasoning-required`、原因、当前 identity、已核对 entries 与未执行 effects
- **AND** executor MUST 停在最后成功 checkpoint，不得猜测命令、扩大授权或写入 delivery tree

### Requirement: Task Finish 必须提供 action registry 查询入口
Buildr MUST 提供只读 `buildr task finish actions` 查询；它 MUST 支持列出版本化 registry，并可结合 finish run 返回当前 step resolution、输入缺口、执行 preview 或 provider handoff。查询 MUST NOT 领取 attempt、执行 action 或修改 run。

#### Scenario: 查询当前 run 的下一动作
- **WHEN** consumer 使用 run identity 查询 actions
- **THEN** JSON MUST 返回 registry schema/version、当前 step、resolution status、selected action 与 plan source
- **AND** 查询前后 finish checkpoint MUST 保持一致

### Requirement: Registry 驱动执行必须兼容现有 finish evidence
`task finish run` MUST 优先使用 registry 解析没有显式 plan 的当前 step，并 MUST 复用既有 attempt、lease、fingerprint、observation ledger、diagnostic、recovery 与 completion receipt。显式 caller plan MAY 保留兼容，但输出 MUST 标明 `registry` 或 `caller-supplied` 来源。

#### Scenario: Registry 自动执行连续动作
- **WHEN** 连续当前步骤均为 ready 的 `product-executable` action
- **THEN** executor MUST 自动生成 fingerprint、执行并提交 completion，直到遇到 provider handoff、输入缺口、失败或 Agent reasoning fallback
- **AND** safe execution summary MUST 报告 action id、plan source、实际步骤与 wall-clock

#### Scenario: Caller plan 兼容路径
- **WHEN** 历史 consumer 显式提交有效 execution plan 与 fingerprint
- **THEN** executor MUST 继续按既有安全约束执行
- **AND** evidence MUST 标记 plan source 为 `caller-supplied`，不得冒充 registry coverage
