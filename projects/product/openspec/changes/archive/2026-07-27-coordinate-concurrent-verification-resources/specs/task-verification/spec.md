## ADDED Requirements

### Requirement: 验证资源协调必须跨 task environment 生效
Task verification provider MUST 在 canonical Workspace 范围内协调不同 task environment、进程和 verification run 对 `coordinated` resources 的占用。Provider MUST 使用容量有界、带 owner/token/expiry 的租约，MUST 在实际命令启动前取得全部必要 claims，并 MUST 保持无关资源可并行。

#### Scenario: 两个任务争用容量为一的浏览器
- **WHEN** 两个 task environment 同时执行声明 browser claim 的验证，且 browser capacity 为 1
- **THEN** 只有一个 run MAY 启动 browser verifier，另一个 MUST 等待
- **AND** 首个 run 释放有效 owner token 后，等待 run MAY 取得该 slot

#### Scenario: 两个任务使用不同资源
- **WHEN** 并发 verification runs 的 claims 不相交且各自环境、副作用与授权均就绪
- **THEN** provider MUST 允许它们并行执行
- **AND** MUST NOT 使用 Workspace 全局锁将无关验证串行化

#### Scenario: 持有进程异常退出
- **WHEN** resource lease 不再续约并超过 expiry
- **THEN** 后续 run MAY 通过原子 stale takeover 恢复该 slot
- **AND** evidence MUST 记录 recovered lease，不得删除仍有有效 heartbeat 的其他 run

#### Scenario: 等待超时或协调状态损坏
- **WHEN** run 在政策定义的等待时限内无法取得 claim，或 lease identity/token 无法安全核验
- **THEN** verification MUST 返回 incomplete 或 failed，并报告 resource、owner 摘要与恢复动作
- **AND** provider MUST NOT 绕过协调直接执行 verifier

### Requirement: 验证资源证据与清理必须绑定当前 run
Verification evidence MUST 分别记录本地 DAG queue 与跨任务 resource wait、claim identity、slot、acquire/release/recovery 状态和 cleanup responsibility。Provider MUST 只释放当前 run 以匹配 token 持有的 claims，只清理 provider-owned task/run-local resources；task-owned 与 external resources MUST 保持各自生命周期边界。

#### Scenario: 验证成功后释放 claims
- **WHEN** verifier 完成且当前 run 仍持有匹配 token
- **THEN** provider MUST 在结果完成前释放 claims并记录 release status
- **AND** 其他等待 run MUST 能继续取得空闲 slot

#### Scenario: verifier 失败或抛出异常
- **WHEN** capability 返回失败、executor 抛出异常或 run 被取消
- **THEN** provider MUST 在 `finally` 边界尝试精确释放当前 claims
- **AND** 测试失败与资源清理失败 MUST 分别披露，不得用 cleanup warning 取代主失败

#### Scenario: cleanup 遇到其他 run 的 token
- **WHEN** slot 当前 owner/token 已改变或属于另一个 task
- **THEN** provider MUST 保留该 slot并返回 ownership mismatch
- **AND** MUST NOT 删除其他 task environment 的资源、租约或诊断
