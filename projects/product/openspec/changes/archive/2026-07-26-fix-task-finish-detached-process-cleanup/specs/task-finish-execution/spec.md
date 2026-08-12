## MODIFIED Requirements

### Requirement: Finish step 执行计划必须可预检
Buildr Task Finish MUST 支持为 step 提交结构化 execution plan，并在动作开始前核对 command entry、cwd、参数与已声明 script 或 selector。规范化计划 MUST 完整保留 completion 重新验证所需的 selector declaration，并纳入 step input fingerprint 和 evidence；第一阶段预检 MUST NOT 被表述为 Buildr 已代替 Agent 执行 provider action。

#### Scenario: npm script 不存在
- **WHEN** execution plan 指向当前 package manifest 未声明的 npm script
- **THEN** Task Finish MUST 在动作执行前返回结构化 blocked 结果
- **AND** MUST 报告 package root、script 和可用入口，而不是启动失败命令

#### Scenario: cwd 或 executable 越界
- **WHEN** execution plan 的 cwd 不在 task environment allowed execution roots 内，或 executable identity 与 receipt 不匹配
- **THEN** Task Finish MUST fail closed
- **AND** MUST NOT 领取该动作的共享资源 lease

#### Scenario: verification selector plan 完成时重放
- **WHEN** step 以已声明 `availableSelectors` 中的 selector 领取并持久化规范化 execution plan
- **THEN** completion MUST 使用同一持久化 declaration 成功重新验证 selector
- **AND** MUST NOT 因规范化过程丢失 `availableSelectors` 而误报 selector 未声明
