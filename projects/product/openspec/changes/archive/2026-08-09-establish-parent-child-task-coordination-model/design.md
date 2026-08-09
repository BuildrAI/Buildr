## Context

Task Record 当前以 `tasks.parent_task_id` 表达单 Parent/多直接 Child，只保存顶层状态且不传播生命周期。Task Development 当前以 `task_development_current.record_json` 保存 closed v2 Receipt，其中 planning snapshot 只登记 artifact authority/reference/identity/summary，immutable handoff 只保存 Candidate、Change dispositions、专业 gates 与 decision。Planning Review 的唯一 applicability 依据是调用方提供的 target identity；Task Overview 则以一条 SQLite 联表动态读取 Child 顶层状态和专业 current 摘要。`task_lifecycle_current` 已由 migration 0009 删除。

历史 Parent `govern-task-intermediate-artifacts` 证明了边界问题：Parent 持有覆盖全部阶段的 active Change/checkbox，两个 Child 已独立完成并归档自己的 Change，Parent 仍需重写 delta 与 planning artifacts。该历史 Task/Change 只作为审计样本，本 Change 不修改或迁移它。

本设计的核心约束是：Parent 协调结果、Child 交付变化；Parent Plan 保存计划、不保存执行状态；Task Record 保存 Task 状态；canonical specs 保存当前契约；Child Development handoff 保存实际交付；所有读写继续通过专业 Application。

## Goals / Non-Goals

**Goals:**

- 在既有 Task Development authority 内表达正式、可审查、可版本化且 opt-in 的 Parent Plan。
- 让 Child Task 声明 planned Contributions，并在现有 immutable handoff 中记录完整 Contribution Handoff。
- 让 Parent reconciliation 成为显式、受 expected identity 保护的计划 mutation。
- 让 CLI、Local App 和 Agent 消费同一 Parent coordination Application read model。
- 保持 Child terminal 状态、Parent Plan identity、Planning Review applicability 与 Parent terminal 状态相互独立。
- 让旧 Task/Receipt 在没有 Parent Plan/Contribution 字段时继续原样工作。

**Non-Goals:**

- 不建设 workflow engine、DAG scheduler、资源锁、自动派工、跨机器同步或通用 Result/event/history/audit store。
- 不在 `tasks` 增加 JSON、Child status array、completed count、Contribution 状态副本或生命周期字段。
- 不在 Parent Plan 保存完整 delta Requirement、migration/字段/file checklist、Child Result 或 Markdown checkbox。
- 不自动扫描、backfill、改写或推断任何历史 Parent Task/Change/`tasks.md`。
- 不自动完成 Parent，不根据代码、文件或 canonical specs 推断 Contribution 已交付。

## Decisions

### 1. 扩展 Task Development Receipt，而不是新增表

Task Development 已是每个 Task 的唯一研发聚合 authority，并已经拥有 planning target、Planning Review applicability 与 immutable Finish handoff。Receipt 升级为 v3：增加可空 `parentPlan`，并让 handoff 增加可空 `contributionHandoff`。v2 reader 正常化为这两个字段 absent/null；repository 继续整值写入同一 `task_development_current` row，不需要 SQL migration 或历史 backfill。

没有选择新 `task_parent_plans` 表，因为那会把 planning authority 从 Development 分裂出去并引入第二 writer；没有把任意 JSON 塞入 `tasks`，因为 Task Record closed v1 只拥有最小顶层事实。

### 2. Parent Plan 使用 closed value objects 与内容派生 identity

Parent Plan closed shape 为：`identity`、`outcome`、`architectureInvariants[]`、`contributions[]`、`dependencies[]`、`finalAcceptance[]`。Contribution 只含稳定 id、capability/result summary 与 planned owner Child identity（可空）；dependency 只引用 Contribution ids。数组排序、唯一性、引用闭包、无循环与非空文本由 Domain 校验，identity 只由这五类内容派生。

Child status、Review/Verification Result、Change lifecycle、实现字段和文件不进入 identity。Parent Planning Review target 固定为 Parent Plan identity；因此普通 Child 状态变化不会使其 stale，只有显式 reconciliation 改变上述内容才会产生新 identity。

### 3. planned Contributions 进入 Child task context，实际交付进入 immutable handoff

Child 的 Development Receipt 增加可空 `plannedContributions`，每项绑定 Parent Task 与 Contribution id。它属于 Child current planning context，不复制 Parent current status。Child 的 `contributionHandoff` 必须完整列出 planned、delivered、extra、residual、superseded、affected Contributions 与 `nextAction`；每个集合使用 Contribution reference/value object，不能用 completed 状态代替。

Finish 继续采用同一 handoff identity和 terminal association，不新增 Result/registry。没有 Contribution 绑定的普通或历史 Task 仍生成旧语义 handoff。

### 4. Parent coordination Application 是唯一组合边界

新增 Parent Coordination Domain/Application，但不新增 repository table。Application 通过 Task Record Application 获取 Parent/直接 Children，通过 Task Development Application 获取 Parent Plan和 Child current/terminal handoff，通过 Finish terminal association确认 delivered handoff，形成 closed read model。SQLite repository可以提供有界批量读取 port，但 interface、CLI、HTTP 与 Local App 不得直接查询表。

Read model 对每个 Child 返回 identity/status、planned/delivered/extra/residual/superseded/affected facts，并对每个 Contribution 计算 `unassigned|planned|delivered|residual|superseded|unproven`。只有 saved handoff 能证明 delivery；Child `completed` 而无 matching Contribution Handoff 必须显示 `unproven`。

最终验收前置条件只表示“所有非 superseded Contribution 已有 saved delivery/residual disposition且依赖闭合”；它不是 Parent completed。最终集成验收是 Parent Development 的显式专业事实，之后仍需正常 Candidate/Review/Finish 或明确 no-change completion。

### 5. reconciliation 是 expected-identity mutation，不是状态同步

`reconcile` 输入包含 expected Parent Plan identity、完整 next Parent Plan 与理由；Application 在单次 Development writer transaction 内比较 identity、校验 Contribution/Child引用与 active ownership，并保存新 Plan。它不修改 Child status、Change 或 handoff。Agent随后按 read model执行必要的独立 Task Record/Child Development/OpenSpec动作：全覆盖的已创建 Child abandon 为 superseded，部分覆盖 Child更新 intent/Change只保留 residual，未创建 Child不再创建或重新规划。

一个具体规范变化只能属于一个 active Change的规则由 Agent workflow与OpenSpec guard执行。Parent 可以有自己的窄 Change，但只覆盖 Parent 亲自承担的集成实现或验收能力；Parent Plan 不被 Change archive。

### 6. forward-compatible、opt-in，无 schema backfill

Receipt v3 normalizer读取 v1/v2 时补 `parentPlan: null`、`plannedContributions: []`、`parentAcceptance: null`；旧handoff保持原bytes与identity，缺失`contributionHandoff`按absent解释而不补入identity。只有显式 `task parent record/reconcile` 才采用新模型。Parent coordination inspect 对旧 Parent 返回 `mode: legacy` 和空 plan diagnostic，所有旧 Task Record/Development/Review/Verification/Finish动作保持可用。

不创建 migration，因为 SQLite table shape不变；fresh/upgrade验证覆盖 migration 0000..当前 ledger 加载 v2/v3 JSON共存。未来如需独立长期 store，必须另行 Change 证明无法继续由 Development authority 表达。

### 7. public surfaces 保持一套 Application

CLI 提供 `task parent inspect|record|bind-child|reconcile|accept` 的窄 actions。Local App Task详情概览新增“父子任务协调”区块，GET调用同一 inspect；mutation 使用 session、same-origin、closed JSON 与 expected identity保护。Agent Skills只描述何时创建 Parent Plan、如何启动 Child、何时 reconcile 和如何解释 handoff，不建立 Markdown同步协议。

## Risks / Trade-offs

- [Development Receipt v3 增大单 row JSON] → Parent Plan只保存协调内容并设置数量/文本上限；不保存Child状态或完整spec正文。
- [Child completed 但旧/缺失 handoff] → read model明确 `unproven`，不推断完成；由显式 reconciliation或后续治理处理。
- [Parent reconciliation与并发 Child Finish竞态] → mutation使用 expected plan identity，readback重新组合最新专业事实；不尝试跨 Application 大事务。
- [同一 active spec delta 被 Parent/Child重复持有] → Parent Plan不能保存delta，Agent/OpenSpec guard在Child启动和reconcile时检查active Change ownership。
- [Local App 变成第二 writer] → HTTP只调用Parent Coordination Application；前端不拼装状态、不直接读取SQLite。
- [Receipt v2/v3兼容复杂] → normalizer单向读取兼容、只写v3；不修改已应用 migration bytes，增加fresh/continuous upgrade fixtures。

## Migration Plan

1. 增加 Parent Plan、Contribution reference/handoff Domain，升级 Development Receipt reader/writer到v3并保持v2 absent-compatible。
2. 增加 Parent Coordination Application和批量专业 read ports，再接CLI/public JSON。
3. 更新Task/Review/Finish边界、Agent Skills/contracts与OpenSpec guard scenarios。
4. 接入Local App API和`buildr-web`协调视图，重建web-dist。
5. 收敛current knowledge，运行fresh/upgrade、Unit/Integration/System、public JSON、CLI/App parity与完整Product Candidate。
6. deterministic converge/archive后由Formal Finish交付；不执行历史数据转换。

回滚在 canonical convergence前丢弃 Task worktree即可。由于没有SQLite schema migration，交付后旧 runtime仍可读取table但会因Receipt major不支持而对采用新模型的Task fail closed；未采用Parent Plan的历史Task不受影响。修复只以前向runtime版本完成，不回写v2。

## Open Questions

没有阻塞实现的开放问题。首版不提供自动 Child 创建或自动 intent/Change改写；Agent根据read model执行独立专业动作并保存各自authority。
