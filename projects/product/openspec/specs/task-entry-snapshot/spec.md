# task-entry-snapshot Specification

## Purpose

定义组合既有 Task、Environment、Development owner 的只读入口快照、直接 blocker、执行路由、typed next 与无第二 authority 边界。

## Requirements

### Requirement: Formal Task 必须提供只读 compact entry snapshot
Buildr MUST提供一次只读 Task Entry Snapshot，将 current Task Record、matching Task Environment execution projection 与已保存 Task Development compact applicability 组合为单一 closed response。该入口 MUST按最早硬前置短路读取，不得创建或更新 Task、Environment、Development、Review、Verification、Candidate、Execution Record、Finish 或其他专业事实。

#### Scenario: active Task 尚无 Environment 或 Development
- **WHEN** 调用方读取一个 active Task 且不存在 matching ready Environment
- **THEN** Snapshot MUST返回 Environment owner 的 required next action、零 effects 与精确 diagnostic
- **AND** MUST不读取 Development、Review、Verification 或 Finish owner，不产生任何专业写入

#### Scenario: Environment ready 但 Development 缺失
- **WHEN** Task Environment owner 返回 matching ready execution projection且尚无 Development Receipt
- **THEN** Snapshot MUST返回 receipt 证明的 execution root、retained controller invocation 与 required Development begin action
- **AND** MUST不扫描、猜测或切换其他 worktree

#### Scenario: Development 已存在
- **WHEN** Environment ready且保存的 Development compact applicability 存在
- **THEN** Snapshot MUST返回 Task、Environment、Development 的最小 identity/current facts与一个 typed next
- **AND** MUST不复制完整 Development Receipt或读取完整下游 Result

### Requirement: Snapshot 必须区分硬前置与可调整建议
Snapshot 的单一 `next` MUST使用 `required|recommended` mode。只有 authority 前置、identity mismatch、stale recovery或provider routing failure可以是 required；正常研发推进 MUST是 recommended，并 MUST不限制用户选择其他仍满足 owner contract 的合法动作。

#### Scenario: 用户调整正常研发顺序
- **WHEN** Snapshot 返回 recommended action且用户选择另一个符合既有专业 contract 的动作
- **THEN** Buildr MUST允许对应 owner按自身 authority 判断该动作
- **AND** Snapshot MUST不因未采用 recommendation 写 gate、改变 Task status或自动阻止合法调用

#### Scenario: identity stale
- **WHEN** Task、Environment或Development保存 identity 与其直接 owner 的 current identity 不匹配
- **THEN** Snapshot MUST fail closed并返回精确 stale axis、owner与required recovery action
- **AND** MUST不自动刷新、覆盖或推进任何正式事实

### Requirement: Snapshot 必须提供 action-local capability route
当 typed next 需要专业 capability 时，Snapshot MUST只返回该 capability/version 的 contract identity、selected provider identity、binding provenance与readiness。它 MUST不返回完整 capability graph、其他 lifecycle provider、候选 provider列表或完整 Skill 正文。

#### Scenario: 后续能力尚未成为 next action
- **WHEN** current next action 不是 Planning Review、Testing、Verification、Completion Review或Finish
- **THEN** Snapshot MUST不返回这些后续 capability/provider identity

#### Scenario: 后续能力成为 next action
- **WHEN** Development typed next 首次指向其中一个后续专业动作
- **THEN** Snapshot MUST只返回该动作的 matching capability contract与selected provider
- **AND** provider unavailable、binding ambiguous或cross-Project binding conflict MUST转为required recovery diagnostic

### Requirement: Snapshot 必须保留 execution root 与 writer provenance
Environment ready 时，Snapshot MUST从 matching Environment Receipt resolver取得 execution roots、retained controller与candidate CLI identity。canonical Workspace writer 命令 MUST路由 retained controller；candidate CLI MUST不得写 retained Workspace。

#### Scenario: candidate CLI 面对 canonical writer
- **WHEN** current next action需要写 canonical Workspace而调用入口来自candidate execution root
- **THEN** Snapshot MUST在命令构造前明确返回retained controller route
- **AND** candidate CLI MUST对retained Workspace保持零写入并给出同一controller diagnostic

#### Scenario: 显式 execution target 不一致
- **WHEN** 调用方提供的显式 execution target 与 matching Environment Receipt 的 allowed execution roots 不一致
- **THEN** Snapshot MUST fail closed、返回 Environment owner recovery与零 effects
- **AND** MUST不搜索其他 worktree、不修改 canonical Workspace

### Requirement: Snapshot profile 必须是 response-only 可观察事实
Snapshot MAY按调用方显式请求返回本次调用的 wall-clock、owner read调用次数、失败或重复尝试事实。profile MUST不包含prompt、隐藏推理、Context Window或估算 token，且 MUST不持久化或影响任何正式 lifecycle authority。

#### Scenario: 请求 profile
- **WHEN** 调用方显式请求 Snapshot profile
- **THEN** 响应 MUST只包含本次调用可观察的耗时与owner调用事实
- **AND** 相同 Task facts 在启用或关闭 profile 时 MUST产生相同 status、next、diagnostic与effects

### Requirement: Snapshot 不得建立第二 authority
Task Entry Snapshot MUST只消费既有 owner read ports，不得新增持久表、Receipt、Result、writer或migration。实际专业动作 MUST继续由原 owner重验并写入。

#### Scenario: 既有生命周期继续执行
- **WHEN** 消费者在 Snapshot 后调用既有 Task inspect、Environment、Development、retry/resume/cancel、Review、Verification、Execution Record或Finish行为
- **THEN** 这些行为 MUST继续使用原有authority、schema与fail-closed边界
- **AND** Snapshot内容 MUST不被视为写入授权或current Result
