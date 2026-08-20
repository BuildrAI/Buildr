## MODIFIED Requirements

### Requirement: Finish producer 必须把每次 invocation 映射为独立 closed execution record
Registered Task Finish runner MUST为每次真正开始的invocation尽力映射一条`task-finish/finish-diagnostics` record。`run_identity` MUST使用独立Finish invocation identity，`target_identity` MUST使用current Content Target identity，`producer` MUST使用稳定registered identity；逻辑run、Candidate/handoff、target与delivery facts MUST进入受控正文。record open、reservation或seal失败 MUST形成portable `attention`，但 MUST NOT阻止已授权的自动交付或delivery reconciliation，也 MUST NOT成为第二个Task/delivery terminal authority。

#### Scenario: 首次 Finish invocation metadata 映射
- **WHEN** producer能够为合法Finish invocation预留容量并打开record
- **THEN** producer MUST幂等绑定Task、owner、kind、invocation和Content Target identity
- **AND** 后续diagnostics MUST按closed body与retention规则处理

#### Scenario: record 容量不足
- **WHEN** 新reservation将超过Task-owner或Workspace容量
- **THEN** Finish producer MUST报告diagnostics attention并继续执行仍满足安全边界的交付或收敛
- **AND** MUST NOT创建未受控正文、伪造retained record或阻止远端事实登记

#### Scenario: 同一 Finish run 恢复
- **WHEN** blocked或cleanup-pending自动Finish run再次执行
- **THEN** producer SHOULD为新invocation尝试独立record并在正文引用原run和ordinal
- **AND** record失败 MUST NOT使原run、delivery evidence或Environment cleanup失效

#### Scenario: invalid或no-op Finish invocation
- **WHEN** request参数、Task/handoff或目标不合法，或既有delivery已经幂等成立
- **THEN** producer MUST NOT要求创建record才能返回诊断或no-op结果
- **AND** execution record MUST NOT改变既有delivery、Task、target或maintenance facts
