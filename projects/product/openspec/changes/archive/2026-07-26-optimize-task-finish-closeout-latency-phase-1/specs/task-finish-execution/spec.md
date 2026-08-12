## ADDED Requirements

### Requirement: Finish step 执行计划必须可预检
Buildr Task Finish MUST 支持为 step 提交结构化 execution plan，并在动作开始前核对 command entry、cwd、参数与已声明 script 或 selector。规范化计划 MUST 纳入 step input fingerprint 和 evidence；第一阶段预检 MUST NOT 被表述为 Buildr 已代替 Agent 执行 provider action。

#### Scenario: npm script 不存在
- **WHEN** execution plan 指向当前 package manifest 未声明的 npm script
- **THEN** Task Finish MUST 在动作执行前返回结构化 blocked 结果
- **AND** MUST 报告 package root、script 和可用入口，而不是启动失败命令

#### Scenario: cwd 或 executable 越界
- **WHEN** execution plan 的 cwd 不在 task environment allowed execution roots 内，或 executable identity 与 receipt 不匹配
- **THEN** Task Finish MUST fail closed
- **AND** MUST NOT 领取该动作的共享资源 lease

### Requirement: Shared lease 必须支持受 fencing 约束的续租
Task Finish MUST 允许当前 holder 在 lease 未过期时使用相同 run、step、attempt 与 token 显式续租。renew MUST NOT 复活过期 lease、覆盖接管者或改变 fencing identity，并 MUST 记录 renewal evidence。

#### Scenario: 当前 holder 续租
- **WHEN** 当前 attempt 在 lease 到期前提交匹配 identity 的 renew
- **THEN** Task Finish MUST 原子延长 expiry 并保留相同 fencing token
- **AND** inspect MUST 返回更新后的 expiry 与 renewal count

#### Scenario: 过期 holder 请求续租
- **WHEN** lease 已过期或已由另一 attempt 接管
- **THEN** Task Finish MUST 返回 `lease-expired` 或 `lease-lost`
- **AND** MUST NOT 修改当前 lease owner

### Requirement: Finish run 必须报告完整阶段和重试耗时
Task Finish MUST 持久化每次 attempt 的 start、finish、duration、outcome 与 retry attribution，并汇总 happy-path wall-clock、workflow check、formal assurance、blocked/retry 和 attributable waste。不同命令或并行检查耗时 MUST NOT 相加冒充 wall-clock。

#### Scenario: step 阻塞后恢复
- **WHEN** 一个 step 阻塞、修复后以新 attempt 成功
- **THEN** inspect MUST 同时保留失败 attempt 与成功 attempt timing
- **AND** MUST 将失败 attempt 标记为 retry/waste，而不是覆盖历史

#### Scenario: 正常路径没有重试
- **WHEN** 所有 step 第一次 attempt 均通过
- **THEN** timing summary MUST 报告 retry count 为零且 attributable waste 为零
- **AND** MUST 返回 run 的真实 wall-clock

### Requirement: Finish run 必须支持晚期资产审查
当首次 asset review finalize 后 archive、integration 或 cleanup 产生新的 observation revision 时，Task Finish MUST 在清理 observation 前重新调用 selected asset-review provider。没有新 revision 时 MUST 确定性跳过 late finalize。

#### Scenario: archive 暴露新长期信号
- **WHEN** archive 阶段写入了晚于首次 finalize 的 observation revision
- **THEN** finish run MUST 在 cleanup 前执行 late asset review
- **AND** provider 返回 `awaiting-human` 时 MUST 保留 environment 并等待决定

#### Scenario: 没有晚期信号
- **WHEN** 首次 finalize 后 observation revision 未变化
- **THEN** finish run MUST 跳过重复资格审查
- **AND** MUST 记录 `not-applicable` evidence
