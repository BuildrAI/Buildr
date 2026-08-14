## Context

Task Development Application 已拥有完整且唯一的研发聚合 read model，内部 driver 默认原样输出 `buildr.task-development-operation-result/v1`。问题不在 authority 缺失，而在日常 Agent 推进需要从大对象中重复提取少量 current facts，且 Application 没有稳定填充 next actions。另一个输入问题是 `begin|planning` 的 schema 允许省略 `planning`，Application 又以 `{}` 归一化，导致 omission 被静默解释为清空 snapshot。OpenSpec convergence 对遗漏 Scenario 已 fail closed，但 blocker 丢失了已算出的 identity 列表。

任务一已经完成阶段化 Skill 读取、一次有界 authority source map、已有验证计划预览和指标非门禁边界；本 Change 不重复这些能力。

## Goals / Non-Goals

**Goals:**

- 让 Agent 在同一次 Development action 后取得足够紧凑的 current facts 与建议性下一步，减少额外 inspect 和本地重建。
- 让 planning snapshot 始终是显式整值输入，避免 omission 的隐式语义。
- 让 OpenSpec semantic blocker 精确指出被省略的 Scenario identities，同时继续由 Agent 做语义判断。
- 保持现有 authority、默认输出、持久化模型和 capability binding。

**Non-Goals:**

- 不让 Buildr 自动选择、执行或跳过专业动作，不合并 Review、Verification、current knowledge 或 Finish authority。
- 不新增效率分数、时限、门禁、状态机或自动推进；指标仍只用于 retrospective 参考。
- 不新增公共 CLI、repository、SQLite 字段、migration 或 runtime binding。
- 不重新建设任务一已经提供的渐进加载、source map 或 verification plan preview。

## Decisions

### 1. Compact 是同一 Application result 的 opt-in driver projection

内部 driver 增加 `--compact`。它先照常执行且只执行一次现有 Application action，再从返回结果投影：operation/status/Task、Receipt digest、保存的 observation time、current applicability axes、关键 identities、Candidate generation、gates、decision、reasons、effects、diagnostic 与 next actions。默认不传参数仍返回完整 v1 result；`--profile` 继续保持现有 profiling envelope，二者不隐式组合。

选择 response projection，而不是新的 `current` repository/read model或第二次 inspect，是为了复用唯一 authority 并避免额外 Workspace observation。Compact 不是新 authority，调用方需要完整 Receipt 时仍读取默认结果。

### 2. Next actions 由保存的 current facts 生成，但只作建议

Application 根据本次已保存 Receipt/applicability 给出一个按研发阶段排序的建议动作：planning Review、stable Content Target、policy、Formal Verification、Candidate、Completion Review、decision、handoff 或等待明确 Finish 授权。建议不执行动作、不修改 status/gate/Candidate，也不根据 timing 或调用次数作判断。

选择在 Application result 生成建议，而不是仅在 Skill 中写固定流程，是因为 Application 已拥有 current facts；Skill 负责解释和选择，Buildr 只返回事实绑定的候选方向。

### 3. `planning` omission 直接失败，不引入 preserve sentinel

`begin|planning` 的 shared action contract 把 `planning` 加入 required fields，Application 只在这两个整值 planning action 上从同一 contract 执行写前 required-field 校验，并移除 `input.planning || {}` fallback。其他 action 保留既有 Application/Domain 诊断顺序。显式空 snapshot 仍使用 `{ "targetIdentity": null, "nodes": [] }`。

不引入 `preserve`、patch 或省略即保留语义，因为 Development planning 是整值 current snapshot；多种写入模式会增加歧义并削弱 closed contract。失败发生在 persistence 前，既有 Receipt 保持不变。

### 4. Scenario omission 只增加可移植诊断，不自动合并

两个仍受测试保护的 deterministic planner 在确认 canonical/baseline Scenario identities 唯一后，对遗漏集合排序，并在原 `semantic-resolution-required` blocker 上增加 `reason: scenario-identities-omitted` 与 `omittedScenarioIdentities`。Requirement、operation 和通用 code 保持兼容；其他语义歧义仍使用现有 blocker。

不把 Scenario 正文复制进结果，也不自动补回或删除。Agent 根据 delta、canonical spec 和 Change intent 修订专业 artifact 后重新 converge。

### 5. Capability contract 保持 v2

默认 Application result、Receipt shape、effects、authorization 和 consumers 均不改变；compact 是 opt-in provider projection，planning 收紧落实了既有“提交完整 planning snapshot”义务。因此继续使用 `buildr.task-development@2`，不改 manifest 或 binding。直接 consumer `task-finish` 和可选 consumer `task-triage` 的默认路径保持兼容。

## Risks / Trade-offs

- [风险] compact 投影遗漏某些低频字段，Agent 仍需读取完整结果 → 明确它只服务 routine transition，并保留默认完整 v1 result。
- [风险] 建议动作被误解为自动授权 → next actions 明确为 response-only guidance，Skill 保留专业 authority、用户授权与停止条件。
- [风险] 旧内部调用省略 `planning` 后失败 → schema、example、Skill 和测试同步，调用方改为显式空或完整 snapshot。
- [风险] blocker 新字段影响 plan identity → 字段只出现在 blocked、零写入 plan；保持确定排序，并由现有 executable identity 隔离版本变化。

## Migration Plan

无需数据 migration 或 backfill。部署后，省略 `planning` 的内部调用需要显式传入完整 snapshot；历史 Receipt 不变。回滚只需恢复代码和随包资产，不涉及 SQLite 或历史 Execution/Result records。

## Open Questions

无。
