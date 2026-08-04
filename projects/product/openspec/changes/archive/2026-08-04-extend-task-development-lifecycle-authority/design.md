## Context

当前 Development Receipt 由 `observe` 首次创建。该动作同时要求 ready Environment、完整 Change dispositions、planning target，并立即观察 Content Target，因此正式 Task 在 proposal、design、Planning Review 或用户明确跳过这些节点时没有 Development read model。后续 Candidate、Verification、Completion 与 handoff 已由 Development 聚合，但前半段仍散落在 Task Record、OpenSpec artifacts 和 Review Result 中。

本次调整需要同时满足两个约束：一是 Development 成为完整研发区间的唯一聚合 authority；二是不能复制 OpenSpec、Review、Verification 的内容，也不能演变为通用 planner、事件流或完整历史数据库。

## Goals / Non-Goals

**Goals:**

- 从首个正式研发动作开始创建 Development Receipt，并持续到 Finish handoff。
- 用最小 current snapshot 表达可选研发节点、专业 authority 引用、identity、缺失、失效、not-applicable 与用户 waiver。
- 保持 Content Target、policy、Candidate、Result gate、decision 与 handoff 的现有专业边界。
- 兼容读取既有 v1 Receipt，并在下一次 Development 写入时确定性升级。
- 让 Local App 在实现和 Candidate 之前也能解释当前研发状态与下一动作。

**Non-Goals:**

- 不让 Buildr 生成 proposal、design、测试或 Review/Verification 结论。
- 不保存 artifact 正文、diff、命令日志、聊天、完整 Result 或完整节点历史。
- 不建设工作流 DAG、通用状态机、事件总线、revision/CAS/lock。
- 不改变 Task Finish 的交付职责，也不允许 Finish 补做研发判断。

## Decisions

### 1. Development 使用 current planning snapshot，而不是通用阶段状态机

Receipt v2 增加 `planning`，包含确定性 `identity` 与按 `id` 排序的 `nodes`。每个节点只保存：

- 稳定 `id` 与可扩展 `kind`；
- 专业 `authority`；
- 可移植 `reference` 与内容 `identity`；
- `pending | current | stale | not-applicable | waived` disposition；
- 最小 `summary`，以及 waiver 必需的明确 `source`。

`current`/`stale` 节点必须引用专业 authority 的 identity；`waived` 必须保存用户或业务授权来源；`not-applicable` 表示任务本身不适用。没有被评估或不存在的节点无需创建空条目。`planning.identity` 只聚合这些 current facts，不复制 artifact 内容。

选择该模型而不是固定 proposal/design/review 三状态，是因为 Task 支持 `0..N Change`、code-only 和 Project 自定义研发产物；固定 OpenSpec 字段会把工具变成 Task Development schema 前提。选择 current snapshot 而不是 append-only event log，是为了保持 Receipt 最小且便于直接恢复。

### 2. 新增 `begin`/`planning` action，Content Target 延后到真正稳定时

内部 Development driver 增加 `begin`（首次建立）与 `planning`（更新 current planning snapshot）动作。两者要求 active Task 与 matching ready Environment，读取 Task Record 形成 `taskContext`，但不观察或要求 Content Target、verification policy、Candidate 或 Result。

现有 `observe` 继续表示“内容已经稳定，可以建立 Content Target”。它复用已保存 planning snapshot，不再承担首次研发事实的唯一入口。这样 proposal Skill、code-only 实现入口和恢复流程都能在第一个正式研发动作调用 Development，而不会提前宣称内容稳定。

### 3. Gate 保存专业 Result 或明确 disposition

Planning、Verification、Completion gate 统一为 closed gate snapshot：

- `current`：保存专业 Result 的最小 digest、target、outcome；
- `not-applicable`：保存适用性依据，不伪造 Result；
- `waived`：保存目标、风险摘要与明确授权来源；
- `null`：尚未判断或仍 pending。

`stale` 只作为 inspect 派生状态，不把旧专业 Result 重新解释为 current。Development policy 决定 Candidate freeze 所需 gate；默认继续要求 current 正向专业 Result，只有明确 `not-applicable` 或用户授权 `waived` 才能替代。负向 current Result 仍使用既有 scoped risk acceptance，不与 waiver 混用。

选择 gate disposition 而不是伪造 passed/ready Result，可以保持 Review/Verification 的事实完整性和单一 writer。

### 4. Candidate shape 保持稳定，generation 吸收 planning 变化

Candidate closed shape 继续只包含 generation、Content Target、Task Context 与 policy identity，不嵌入 planning/Review/Verification Result。planning snapshot 或 gate disposition 变化时，Application 清除 current Candidate；下一次 freeze 递增 generation，因此 Candidate identity 随之变化，同时兼容现有 v1 Candidate 与 handoff。

这比把全部 planning node/Result identity塞入 Candidate 更符合现有“专业 Result 被引用而不进入 Candidate identity”的边界，也降低迁移风险。

### 5. Contract 与 Receipt 升级为 v2，并兼容读取 v1

`buildr.task-development@2` 使用 `buildr.task-development-receipt/v2`。Repository 允许读取 v1：

- 从已有 planning gate target 合成最小 planning snapshot；
- 把旧 gate 转成 `current` disposition；
- 保留原 Candidate、generation、decision 与 handoff identity；
- 只在下一次合法 Development mutation 时写成 v2，不在 inspect 静默改写。

Task Finish 与其他 required consumer 同步绑定 v2。v1 contract 不再声明为 active provider，避免新 provider 在 waiver 与早期 Receipt 行为上伪装符合旧保证。

### 6. Local App 只展示聚合事实，不增加 writer

“研发”视图增加 planning nodes、disposition、authority、waiver 与 Content Target 尚未形成的状态。HTTP 继续只调用 `inspect`、保持 `no-store`，不提供浏览器 mutation。长 identity 和专业引用保持次级信息；默认突出“规划中 / 研发中 / 候选已就绪 / 研发交接已就绪”与阻塞原因。

## Risks / Trade-offs

- [任意 planning kind 可能被滥用为通用任务步骤] → schema 只接受专业 authority、portable reference/identity 与有限 disposition；Skill 明确禁止进度、attempt、命令和完整历史。
- [waiver 可能弱化门禁] → waiver 必须绑定精确目标、summary 与授权 source；无明确授权不得保存或用于 freeze/handoff。
- [v1 Receipt 迁移改变 handoff] → 迁移保留 Candidate 与 handoff bytes 语义，planning 只从已有 gate 合成；inspect 不自动写盘。
- [早期 inspect 无法实时重算任意外部 artifact] → Development 只声明最后一次由专业动作登记的 snapshot；专业动作更新 artifact 时必须同步调用 planning action，Planning Review 仍以 target identity 提供确定性 currentness。
- [跨 Skill binding 变化造成 consumer blocked] → Task Development、Task Finish、Task Triage 和 OpenSpec sidebar 在同一 Change 中升级并运行组合验证，runtime sync 后以 Doctor 检查 graph。

## Migration Plan

1. 增加 v2 domain normalization、v1 read migration与repository round-trip测试。
2. 增加 begin/planning action，调整 observe、inspect、freeze、decision和handoff gate处理。
3. 升级 capability contract、provider/consumer bindings与 Skill routing；OpenSpec propose/update sidebar在正式 Task 中登记 planning nodes。
4. 扩展 Local App read model和最小 UI。
5. 运行 Task Development unit/integration/system、Local App、Finish consumer、package/runtime projection与 affected product verification。
6. sync retained runtime 并通过 Doctor 确认 binding 全部 ready。

回滚时恢复旧产品代码与 v1 binding；尚未写入 v2 Receipt 的任务可直接恢复。已经写入 v2 Receipt 的任务不得由旧产品强行读取，必须保留新版产品或使用受测降级工具转换，不能手改 YAML。

## Open Questions

无。用户已确认研发节点可以不存在、not-applicable 或明确 waived；Development 只拥有聚合事实，不取得专业内容 authority。
