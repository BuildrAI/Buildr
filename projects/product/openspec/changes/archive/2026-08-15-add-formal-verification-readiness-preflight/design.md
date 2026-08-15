## Context

Task Development 的 contract/Skill 已规定：内容、测试反馈、current knowledge 与关联 Change 的 deterministic convergence/archive 完成后，才能观察 stable Content Target；Formal Verification 再绑定该 target 与 policy。但当前 Application 的 `observe` 接受 `pending` Change，`taskDevelopmentNext` 也只看 Content Target、policy 与已有 Verification gate，所以旧的或过早形成的 Receipt 可能在 Change 尚会搬迁/改写内容时推荐昂贵验证。

约束包括：Task Development 只能聚合自己拥有的 facts；current knowledge 仍由 selected provider 判断；Task Verification 只执行并记录正式验证；开发期测试与通用 `verification run` 不得经过新门禁；不能增加 Receipt/SQLite authority。

## Goals / Non-Goals

**Goals:**

- 让新 `observe` 无法在明确 `pending` Change 上冻结一个伪稳定 Content Target。
- 在 Task Entry 的 compact read model 中展示动作就近的 Formal Verification readiness，避免 Agent 只看到 `verify` 而忽略尚未稳定的事实。
- 只阻止明确已知 blocker；current knowledge 由其 owner 做一次只读检查，未知不升级为全局硬门禁。
- 保持 code-only、Workspace-only、空 Change 与 `not-applicable` 的合法路径。

**Non-Goals:**

- 不修改 `verification run`、Task Verification Result schema/executor、Project declaration 或 Candidate CI。
- 不持久化 preflight Result、current knowledge digest、执行次数或耗时。
- 不让 Task Development 解析 OpenSpec checklist/archive 文件，或判断 current knowledge 正文。
- 不替代 Planning Review 前的 OpenSpec semantic readiness preflight。

## Decisions

### 1. 在 `observe` 写入边界拒绝明确 `pending` Change

`observe` 已收到完整 `changeDispositions`，Application 继续通过 Task Record/Task-scoped Change read model 校验这些事实。只要有 `pending`，就在观察 Content Target 和写 Receipt 之前返回稳定诊断；`converged` 仍要求 working copy `available + archived`，`not-applicable` 与空数组直接通过。

这比在 Task Verification executor 检查 Change 更早，也避免 Verification 模块理解 OpenSpec。替代方案是只更新 Skill 文案；它不能修复 Application 允许过早 `observe` 的事实，因此不采用。

### 2. readiness 是 response-only 派生事实，不进入 Receipt

Task Development 根据本次已保存 applicability、Task Context Change dispositions、Content Target、policy 与 Verification gate 派生 `formalVerificationReadiness`：

- `not-applicable`：尚未到正式验证交接，或 matching current Verification 已存在；
- `blocked`：到达交接附近但存在明确 pending Change、stale/missing target/policy 或其他 Development-owned blocker；
- `unknown`：Development-owned facts 已满足且仍缺 Formal Verification，但 current knowledge 必须由其 owner 对当前 tree 即时确认。

compact Development result 与 Task Entry Snapshot 原样投影该摘要；SQLite Receipt、Candidate identity 与 Result 均不增加字段。旧 Receipt 若曾在 pending Change 上形成 target，也会在读取时显示 blocked，不需要迁移。

替代方案是保存一次 preflight Result。它会制造新的 currentness/失效 authority，并要求在每次 tree 变化后维护，故不采用。

### 3. `unknown` 只产生推荐动作，不形成全局强约束

当 known facts 已就绪、Verification 仍缺失时，typed next 先指向 selected `buildr.current-knowledge-maintenance@2` 的 `inspect`，mode 保持 `recommended`。Provider 返回 `aligned|not-applicable` 后，Task Development Skill 在同一 current tree/target 上形成瞬时 `ready` 汇总并直接进入现有 `task-verification`；`unresolved` 才停止。

Task Development Application 不保存或解释这个 provider Result；再次读取 Snapshot 可能仍显示 `unknown`，这是无持久 authority 的预期代价。Agent 已持有同一 tree 的 current inspect Result 时不必重复读取 Snapshot。

替代方案是让 Development Application直接调用 current knowledge provider。capability provider 是可替换的专业 owner，Application 不应复制其语义或旁路 Skill 编排，因此不采用。

### 4. 对开发反馈与正式验证做明确作用域隔离

新逻辑只位于 Task Development `observe`、readiness projection 与 Task Entry next。focused/affected/full 开发反馈仍由 Project 测试入口直接执行；Task 外 `verification run` 和 Candidate CI 不读取 Task Development readiness。

这样预检不会增加每次开发测试的调用成本，也不会把尚在开发中的测试误判为 Formal Verification。

## Risks / Trade-offs

- [无持久 knowledge evidence 导致恢复后再次提示 inspect] → inspect 是只读、action-local；不为减少一次轻量检查引入新 authority。
- [旧 Receipt 已在 pending Change 上保存 Content Target] → 只读 readiness 显示 blocked，下一次 `observe` 必须先收敛 Change；不迁移或静默改写旧 Receipt。
- [调用方绕过 recommended next 直接运行正式验证] → `observe` 对新路径提供真正 fail-closed 边界；Skill/contract 明确 owner 顺序，但不把 recommendation 伪装成新的 Verification 全局门禁。
- [并行 OpenSpec semantic preflight 修改相邻 workflow 文案] → 本 Change 不改其 planner/CLI；集成时只合并 Task Development → Verification 的独立段落。

## Migration Plan

1. 先增加 `observe` pending Change 的回归测试与 readiness 派生单测。
2. 扩展 compact/Task Entry projection 和 typed next 测试，确认 generic verification surface 无变化。
3. 更新 Task Development contract/Skill 与 agent workflow 当前知识，执行 affected feedback 与 formal verification。
4. 通过现有 deterministic converge 归档；无需数据库迁移或历史 Receipt backfill。

回滚时移除派生 projection/next 与 `observe` 新诊断即可；没有新增持久数据需要清理。

## Open Questions

无。
