## ADDED Requirements

### Requirement: Release Git mutation 必须绑定matching Task Environment execution root
Release selection、reopen、main coverage/reconciliation与generation carrier准备等checkout-scoped Git mutation MUST只在matching active `release-<version>`协调Task的ready Task Environment execution root中运行。Consumer MUST从Environment read model构造closed binding，owner MUST独立核验canonical Workspace、Task、worktree provider evidence、repo root、branch、HEAD与runtime/controller identity；retained primary worktree和caller提交的路径声明 MUST NOT成为执行授权。

#### Scenario: matching release execution root
- **WHEN** active release Task、ready Environment、provider-owned worktree、release branch与expected HEAD全部匹配
- **THEN** owner MAY执行已单独授权的selection或reconciliation Git mutation
- **AND** result MUST返回Environment binding identity与实际execution root disposition

#### Scenario: retained workspace被作为repo输入
- **WHEN** 调用方把canonical retained primary worktree传给release Git owner
- **THEN** owner MUST在checkout、merge、commit、ref mutation或remote push前失败关闭
- **AND** retained branch、index与working tree MUST保持不变

#### Scenario: Environment binding漂移
- **WHEN** Task、Receipt、worktree provider evidence、branch或HEAD不再匹配closed binding
- **THEN** owner MUST返回current expected/actual identity与唯一Environment恢复动作
- **AND** MUST NOT扫描其他worktree、切换执行root或回退到retained controller checkout执行Git mutation

### Requirement: Final release source 必须在 Candidate 前固定
Release lifecycle MUST把完成current main coverage与历史收敛后的generation作为唯一final release source。Freeze history MUST保留pre-reconciliation generation，但Candidate、唯一artifact、carrier、main tree与publication context MUST只绑定final generation；普通dev前进 MUST继续不改变该source。

#### Scenario: pre-reconciliation generation存在历史Candidate
- **WHEN** 旧run绑定pre-reconciliation commit或generation
- **THEN** owner MUST保留其历史evidence但标记为stale
- **AND** MUST NOT把相同tree、成功aggregate或已下载tarball解释为final source current

#### Scenario: final source已固定
- **WHEN** main coverage/reconciliation、selection freeze与Environment binding均current
- **THEN** 后续完整Candidate MUST只运行在final commit/tree/generation
- **AND** Candidate通过后release source MUST保持不可变直到main merge或由main drift显式产生下一generation
