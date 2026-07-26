## ADDED Requirements

### Requirement: Finish run identity 必须限制在 canonical state root
Buildr MUST 验证 finish run id 并保证全部 run 读写路径位于当前 Workspace 的 `.buildr/task-finish/runs/` 内。

#### Scenario: run id 包含路径逃逸字符
- **WHEN** consumer 使用包含路径分隔、`..` 或不受支持字符的 run id
- **THEN** Buildr MUST 在任何文件读写前拒绝该请求
- **AND** MUST NOT 在 canonical runs root 之外创建或覆盖文件

### Requirement: Finish step completion 必须携带最小可信证据
Buildr MUST 只接受与当前 running attempt、input fingerprint 和结构化 evidence 匹配的 step completion；`integration-push` MUST 另外提交匹配的 expected/observed target ref observation。

#### Scenario: step 缺少 fingerprint 或 evidence
- **WHEN** consumer 提交 `passed` 但没有非空 input fingerprint 或稳定 evidence identity
- **THEN** Buildr MUST 拒绝 completion 并保持该 attempt 未通过
- **AND** MUST NOT 记录 effects 或释放共享 lease

#### Scenario: integration push 缺少远端 observation
- **WHEN** consumer 为 `integration-push` 提交 `passed`，但缺少 expected 或 observed target ref
- **THEN** Buildr MUST 拒绝 completion
- **AND** MUST NOT 把传输动作记录为成功

#### Scenario: 重复提交成功结果
- **WHEN** consumer 重复提交相同 attempt、fingerprint、effect identities 和 evidence identities
- **THEN** Buildr MUST 返回现有 checkpoint
- **AND** MUST NOT 重复记录副作用

### Requirement: Shared lease 必须使用 fencing identity
Buildr MUST 用 lease key、run、step 和 attempt token 共同标识共享资源 owner，并 MUST 在 completion、release 和 expired takeover 时核对当前 lease identity。

#### Scenario: 旧 holder 在 lease 被接管后完成
- **WHEN**旧 lease 已过期且另一 run 已接管资源，原 holder 随后提交 completion
- **THEN** Buildr MUST 返回 `lease-lost` 或等价 blocked 结果
- **AND** MUST NOT 删除新 holder 的 lease 或接受原 holder 的成功结果

#### Scenario: lease 在动作执行期间过期
- **WHEN** holder 提交 completion 时当前 lease 已过期且未被同一 attempt 有效持有
- **THEN** Buildr MUST fail closed 并要求重新领取或恢复该步骤
- **AND** 已 passed 的无关上游步骤 MUST 保持不变
