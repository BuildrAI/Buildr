## Context

Task Finish 的类型化恢复（Typed Recovery）能够使 `current-knowledge`、`contract-convergence`、候选、目标、运行时和正式验证证据按身份变化失效，但 OpenSpec convergence 还维护独立的阶段凭证。旧流程到达 `post-sync` 后，如果实现修订同时改变 delta，convergence application service 只比较当前 delta hash 与旧收敛凭证；不一致时直接抛出 `receipt stale`。Task Finish 因而知道应重新收敛，却无法让 OpenSpec 子流程回到合法起点。

现有确定性同步计划已经保存每个 canonical 文件的完整 `before`、`expected` 内容及摘要，契约基线保存同步前 Requirement 事实，收敛凭证保存 change、project、delta、OpenSpec executable 和阶段转换。这些资产可以证明旧同步前后状态，不需要采用当前 `post-sync` canonical 作为新基线。

## Goals / Non-Goals

**Goals:**

- 为已证明的旧 `post-sync` 状态提供产品持有、身份绑定且可重复执行的恢复。
- 恢复到旧同步计划记录的精确 `before` 文件，再从该真实 `pre-sync` 事实为新 delta 建立基线并重新执行完整 convergence。
- 让动作注册表为所有可预期的 convergence blocker 返回产品动作、语义处理交接或明确不可恢复结论。
- 用真实 Task Finish、动作注册表和 OpenSpec handler 组成端到端恢复测试。

**Non-Goals:**

- 不自动解决 Requirement 语义冲突、canonical 外部漂移或多个 active Change 冲突。
- 不放宽 pre-sync/post-sync guard，不允许采用事后 baseline。
- 不改变正式验证、Git、归档或修复授权政策。
- 不优化与本缺陷无关的收尾耗时、输出大小或 provider 自动化。

## Decisions

### 1. 使用旧确定性同步计划作为可逆恢复依据

恢复计划必须同时核对旧 convergence receipt、deterministic sync plan、contract baseline 和当前 canonical：change/project/executable identity 必须一致；旧 plan 的 delta 与旧 receipt 一致；当前受影响文件必须逐一匹配旧 plan 的 `expectedDigest`。全部成立时，旧 plan 的完整 `before` 内容才是可证明的 `pre-sync` 文件。

选择这一方案，是因为它恢复的是同步前已记录内容，而不是从当前结果反推或重新采用 baseline。仅删除 receipt、直接更新 delta hash 或以当前 canonical 执行 `baseline --update` 都会掩盖事后状态，因此禁止。

### 2. 先在隔离 Project surface 验证恢复树，再原子替换

产品先把旧 plan 的 `before` 文件与未触及文件投射到任务拥有的临时 Project surface，使用凭证绑定的 OpenSpec executable 执行 `validate --all --strict`。验证通过后才原子替换真实 canonical 文件；任一摘要、文件或验证不匹配时保持真实树零写入。

替换成功后，产品从已恢复的 canonical 事实为当前新 delta 重建 contract baseline，记录旧/新 delta、旧 plan、恢复前后 canonical 摘要和恢复原因，再重新执行 archive rehearsal、pre-sync、deterministic plan/apply、strict validation 与 post-sync。重复调用如果已经位于恢复后 checkpoint，应复用恢复凭证，不重复写入。

### 3. 将恢复分类纳入 convergence result 和动作注册表

convergence 不再把所有 stale receipt 变成无结构异常，而是返回以下稳定分类：

- `recoverable-stale-receipt`：证明充分，由产品恢复动作继续；
- `semantic-resolution-required`：当前 canonical、Requirement 或 active Change 存在需要 Agent/用户判断的冲突；
- `recovery-unprovable`：缺少旧 plan、摘要或 executable identity，保持零写入并返回缺失证据。

Task Finish 动作注册表消费该结构化结果：第一类继续同一 `contract-convergence` attempt 或类型化恢复 attempt；后两类返回明确交接和未执行 effects。可预期 blocker 不得只留下通用错误字符串。

### 4. 用真实跨模块流程作为完成门槛

集成测试必须创建真实 OpenSpec fixture 和 finish run，执行首次 convergence 到 `post-sync`，修改实现和 delta，提交 `implementation-changed` recovery，再通过 action registry 调用真实 convergence handler，最终推进到正式验证边界并完成归档检查。测试可以使用本地、确定性的验证摘要 fixture，但不得用 `/usr/bin/true` 代替 convergence。

同时保留局部 guard 测试，并增加每个负向门禁对应的恢复或终止测试，避免只证明“能够拒绝”而没有证明“能够完成”。

## Risks / Trade-offs

- [旧同步计划缺失完整 `before` 内容或摘要不匹配] → 返回 `recovery-unprovable` 并保持现场，不尝试猜测或人工删除凭证。
- [恢复 canonical 后进程中断] → 使用版本化恢复凭证和原子文件替换，使重试能够识别已完成 checkpoint；不得用未记录的部分写入继续。
- [新 delta 扩大 Requirement 集合] → 只在恢复到真实 `pre-sync` 文件后重建 baseline，让新增目标从同步前 canonical 事实重新采样。
- [端到端测试变慢] → fixture 使用最小 Project 和本地 OpenSpec executable，但保留真实应用服务、动作注册表、文件写入和凭证链。
- [自动恢复掩盖外部 canonical 改动] → 只有当前文件完整匹配旧 `expectedDigest` 时才自动恢复；任何额外漂移都进入语义处理。
