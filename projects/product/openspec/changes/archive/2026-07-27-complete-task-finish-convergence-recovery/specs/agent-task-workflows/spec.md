## ADDED Requirements

### Requirement: post-sync 后的实现变化必须恢复到可证明的 pre-sync 事实

当 active Change 已完成旧 delta 的 `post-sync`，随后合法实现变化改变 delta identity 时，Buildr MUST 只使用旧 contract baseline、deterministic sync plan、convergence receipt 和当前 canonical 摘要恢复旧同步前事实。Buildr MUST NOT 删除 receipt 后从当前 `post-sync` canonical 创建或更新 baseline。

#### Scenario: 当前 canonical 精确匹配旧同步结果

- **WHEN** 旧 plan 与 receipt identity 一致，且全部受影响 canonical 文件匹配旧 plan 的 `expectedDigest`
- **THEN** Buildr MUST 在隔离 Project surface 验证旧 plan 的完整 `before` 文件
- **AND** 严格验证通过后 MUST 原子恢复这些文件、从恢复后的事实为新 delta 建立 baseline并重新执行完整 convergence

#### Scenario: 当前 canonical 包含旧同步之外的漂移

- **WHEN** 任一受影响 canonical 文件不匹配旧 plan 的 `expectedDigest`
- **THEN** Buildr MUST 返回 `semantic-resolution-required` 或 `recovery-unprovable`
- **AND** MUST NOT 覆盖 canonical、刷新 baseline或继续 pre-sync、sync、post-sync 与 archive

#### Scenario: 隔离恢复树严格验证失败

- **WHEN** 旧 `before` 文件投射后的临时 Project 未通过凭证绑定 OpenSpec executable 的严格验证
- **THEN** 恢复 MUST 整批零写入并返回失败阶段、executable identity、expected digests 和诊断引用
- **AND** 重试 MUST 从同一恢复 checkpoint 开始，不得留下部分 canonical 写入

#### Scenario: 恢复动作重复执行

- **WHEN** 同一 old/new delta、sync plan 和 canonical identity 的恢复动作被重复调用
- **THEN** Buildr MUST 复用版本化恢复凭证和已完成 checkpoint
- **AND** MUST NOT 重复恢复文件、重建多个 baseline 或重复已通过的副作用
