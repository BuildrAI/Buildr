## Context

当前 Development 以 `task_development_current` 聚合 Task Context、planning、Content Target、verification policy、Verification/Review gate、Candidate 与 immutable handoff；Task Verification 以独立 current slot 保存 v1 Result，正式 command execution 另有可持久化的 Task Execution Record。现有实现的问题不是缺少阶段，而是 authority 与顺序绑定不正确：Candidate 在 Verification 之后生成，Verification Result 不绑定 Candidate 或 execution authority，Current Knowledge 只作为验证前即时建议且不进入 handoff applicability。

本 Change 必须保持各专业 owner 分离，并与并发的 Workspace source/Doctor 重构无文件与语义重叠。

## Goals / Non-Goals

**Goals:**

- 让 stable Content Target 与 policy 先形成 Task Candidate，随后 Formal Verification 和 Completion Review 均绑定该 Candidate。
- 让正式 capability facts 只能从可独立读取、matching 的 terminal Verification Execution Record 对账进入 current Result。
- 让 Development 保存 current knowledge 的最小 disposition，并只以 completion-critical conflict 阻止 handoff。
- 保持旧 v1 Verification Result 可读、旧 Development Receipt 可读，current writer 只写新事实。

**Non-Goals:**

- 不创建通用 CI/GitHub/外部系统 adapter registry，也不接受自由文本或聊天摘要作为外部证据。
- 不把 Current Knowledge 变成第二套规范、Review 或 Verification Result。
- 不实现 legacy Parent correction、UI 改造、测试框架重构或 Release Candidate 优化。

## Decisions

### 1. Candidate 是稳定内容身份，不是“验证已完成”的证明

`freeze` 只要求 current Task Context、planning disposition、stable Content Target 与 verification policy。Candidate identity 继续只绑定这组 Development-owned inputs；Verification 与 Completion Result identity 不进入 Candidate。Verification/Completion 后续绑定 Candidate，handoff 再聚合 current gates、knowledge disposition 与风险决定。

备选方案是保留 Verification-before-Candidate，只放宽 Skill 文案；这无法让外部证据精确指向同一个候选，也继续把一种工作顺序固化为产品门禁，因此不采用。

### 2. Verification Result v2 绑定 Candidate 和 evidence authority

current writer 只写 `buildr.task-verification-result/v2`。每个 capability fact 增加 closed `evidence`，当前只支持 `task-execution-record`：包含 record/run/invocation/body identities。`reconcile` 读取 Workspace SQLite 与受控 body store 中的 terminal record，核验 Task、owner/kind、Candidate、Content Target、Project、declaration、capability、target stability 与 outcome，再从 summary checks 提炼 portable facts；调用方不能提交 outcome 或 fact 正文。

既有 v1 Result 保持 dual-read，但由于缺少 Candidate/evidence authority，在新 Candidate 流程中只能作为历史事实展示，不能成为 current Verification gate。这样避免回填伪证据。

不采用自由 `--evidence-uri` 或签名 JSON：没有 owner adapter 实际观察外部系统时，它们仍只是 claimed success。未来真实 CI provider 可产生同一受控 execution authority，而不需要改变 Result 模型。

### 3. Formal execution 在启动前绑定 current Candidate

`task-development` 已依赖 `task-verification`，因此 runner 不能反向读取 Development 而形成模块环。Development consumer 从 current Receipt 取得显式 Candidate lease（identity、generation、Content Target），正式 `verification run` 在任何副作用前要求该lease并把它加入 invocation identity 与 Execution Record summary；Task Verification reconciliation 与后续 Development inspect 再独立证明Result绑定current Candidate。缺失lease或target不一致时只阻止本次 Formal Verification execution。Task 外 transient run 不接受也不要求Candidate，仍不能形成formal Result。

### 4. Current Knowledge 是 handoff applicability，而非固定阶段

Development 增加 `knowledge` action，保存 selected provider 对 current tree 的最小 disposition：`aligned|not-applicable|attention|blocked`、tree identity、summary、source identities 与 bounded unresolved items。Content Target 或 Task Context 变化使其 stale。

`blocked` 仅用于 canonical/current knowledge 冲突会导致错误完成结论；解释性漂移、无关历史债务或可后续修复事项必须是 `attention`，不会阻止 Candidate、Verification 或 Completion。handoff 要求 current disposition 且不为 blocked。Agent 可以在实现、Review 或 Verification 前后调用 provider；产品不规定固定顺序。

### 5. 保持专业结果与 Development 聚合分离

Task Verification Application 独占 Result reconcile；Task Review 继续独占 Planning/Completion Result；Current Knowledge provider 维护 Brief/knowledge/sidecar；Development 只保存最小引用、适用性和决定。Finish 仍只消费 immutable handoff，不读取或补跑上述专业事实。

## Risks / Trade-offs

- [旧 v1 Result 不能直接复用] → 明确显示 stale/legacy-unbound，针对 current Candidate 重新从已有 matching Execution Record reconcile；无法证明时重新执行，而不是回填。
- [Execution Record body 已按 retention 清理] → reconciliation 返回 evidence-unavailable，保留 current Result 不变；Result 一旦成功写入后不依赖正文保持可读。
- [知识分类可能被滥用为 attention] → Skill/contract 明确 completion-critical 判据，并在 handoff 前保存 source identities 与 unresolved 摘要；canonical 冲突不得降级。
- [流程改序影响既有测试] → 以 domain/application/CLI journey 覆盖 Candidate-first、旧 schema dual-read、evidence mismatch fail-closed 和 attention isolation。

## Migration Plan

1. 先增加 Verification Result v2 dual-read/current-write 与 execution evidence reconciliation。
2. 再调整 Development Candidate/gate/current knowledge 模型及 internal contracts。
3. 更新 Workspace source Skills/contracts、OpenSpec/current knowledge 与测试。
4. 通过 deterministic convergence 归档 Change；不迁移或回填既有 Workspace SQLite rows。

回滚时可以恢复旧 writer 与顺序；已写 v2 Result 在旧版本中会被明确报告 unsupported，而不会被误读为 v1 或自动改写。

## Open Questions

无。真实外部 CI provider 的观察方式留给未来具名 integration，不在本 Change 中建立抽象平台。
