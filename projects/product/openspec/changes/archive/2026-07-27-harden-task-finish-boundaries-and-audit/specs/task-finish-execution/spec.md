## ADDED Requirements

### Requirement: Task Finish 必须产品化执行停止边界
Buildr MUST 为语义冲突、无法证明状态、正式保证失败和重要集成冲突持久化绑定 run、step、输入摘要、阻塞代码与动作身份的 `blockIdentity` 及恢复策略。普通 `resume` MUST NOT 清除这些停止边界；只有策略允许的可验证输入变化、绑定当前 `blockIdentity` 的显式授权，或正式保证专用的修复授权与类型化恢复才能创建新 attempt。

#### Scenario: 同一语义冲突被普通恢复
- **WHEN** 产品执行的 OpenSpec 收敛因语义冲突阻塞，输入摘要没有变化且调用方执行普通 `resume`
- **THEN** Task Finish MUST 保持原步骤 blocked 并保留原失败 attempt
- **AND** MUST NOT 发放新 attempt token 或接受调用方自报的 passed evidence

#### Scenario: delta 已形成新输入
- **WHEN** Agent 或用户处理语义冲突后，产品观测到当前步骤输入摘要已经变化
- **THEN** `resume` MUST 使旧阻塞失效并以新输入创建新 attempt
- **AND** 新 attempt MUST NOT 覆盖旧阻塞身份和失败证据

#### Scenario: 正式保证失败
- **WHEN** formal-assurance 已以失败身份阻塞
- **THEN** 普通恢复和通用解决授权 MUST 被拒绝
- **AND** 只有绑定失败身份与允许修改范围的修复授权及类型化恢复 MAY 推进实现变化

#### Scenario: 重要集成冲突
- **WHEN** target convergence 报告需要语义处理的重要 rebase 或 merge 冲突
- **THEN** run MUST 停止并要求新 candidate/target 事实或绑定阻塞身份的集成解决授权
- **AND** Task Finish MUST NOT 自动选择冲突内容

### Requirement: Task Finish 必须区分执行计时与检查点等待
Task Finish MUST 只把产品命令实测或与当前候选身份匹配的 `buildr.verification-timing/v1` 摘要计入 provider execution；普通 completion 的调用方手写时长和 attempt 检查点等待 MUST NOT 计入正式验证时间。检查结果 MUST 分别报告产品执行、提供者执行、检查点等待、不可观测区间和计时覆盖来源。

#### Scenario: 外部验证提供受信摘要
- **WHEN** formal-assurance completion 携带状态通过、候选身份匹配且有稳定摘要身份的验证计时摘要
- **THEN** initial verification 或 re-verification MUST 使用摘要的 `totalDurationMs`
- **AND** 领取 attempt 到提交 completion 的其余时间 MUST 归入 checkpoint wait 或不可观测区间

#### Scenario: 调用方只提交普通 duration
- **WHEN** completion evidence 只包含调用方手写 `durationMs`，没有受信验证摘要或产品命令观测
- **THEN** Task Finish MUST NOT 将该数值计入正式验证耗时
- **AND** timing coverage MUST 标记该执行为外部不可观测

