## ADDED Requirements

### Requirement: Task Finish 必须为可预期收敛阻塞提供恢复出口

Task Finish MUST 将 OpenSpec 收敛中的可预期身份变化分类为产品可执行恢复、语义处理交接或证据不足的明确终止；MUST NOT 只返回没有后续动作的通用阻塞。动作注册表 MUST 持有对应动作、授权、effects、输入和结果证据。

#### Scenario: post-sync 后实现变化使收敛凭证过期

- **WHEN** finish run 已完成旧 delta 的 `post-sync`，随后以可核验的 `implementation-changed` transition 更新 change 和候选身份
- **THEN** `contract-convergence` action MUST 解析产品持有的 stale receipt recovery
- **AND** recovery 可证明安全时 MUST 自动恢复并重新执行 convergence，而不是要求 Agent 删除、移动或重建 receipt

#### Scenario: 恢复需要语义判断

- **WHEN** 当前 canonical 与旧同步结果不一致，或 Requirement、active Change 之间存在语义冲突
- **THEN** action resolution MUST 返回 `semantic-resolution-required`、冲突 identity、未执行 effects 和最小处理上下文
- **AND** finish run MUST 保留最后成功 checkpoint，不得猜测恢复内容

#### Scenario: 恢复证据不足

- **WHEN** 旧 baseline、sync plan、receipt 或 executable identity 无法共同证明恢复前后状态
- **THEN** action resolution MUST 返回 `recovery-unprovable` 和缺失证据
- **AND** canonical、baseline、receipt、archive、Git 与正式验证 MUST 保持未执行

### Requirement: Task Finish 必须验证真实收敛恢复旅程

Buildr MUST 以真实 Task Finish 状态机、动作注册表、OpenSpec application service 和文件凭证验证收敛恢复的完整旅程；局部门禁测试或通用成功进程 MUST NOT 替代该完成证据。

#### Scenario: 类型化恢复重新到达正式验证边界

- **WHEN** 测试 fixture 首次完成 `post-sync`，随后修改实现和 delta 并提交 `implementation-changed` recovery
- **THEN** 同一 finish run MUST 通过 registry 恢复 `contract-convergence` 并重新到达 required formal assurance boundary
- **AND** 测试 MUST 证明旧有效 evidence 已失效、未变 effects 未重复且新 convergence receipt 绑定当前 identity

#### Scenario: 每个负向门禁具有对应完成结论

- **WHEN** 产品为可预期 convergence blocker 增加或保留负向测试
- **THEN** 同一测试集合 MUST 覆盖其安全恢复、语义交接或明确不可恢复结论
- **AND** 仅断言命令失败 MUST NOT 作为该 blocker 的完整验收
