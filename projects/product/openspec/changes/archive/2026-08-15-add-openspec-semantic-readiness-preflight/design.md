## Context

当前 OpenSpec Change 在 Planning Review 前只运行上游 `openspec validate --strict`。该检查能确认 artifact 结构，却不会把 delta 投射到当前 canonical specs，也不会识别完整 `MODIFIED` 省略既有 Scenario、Requirement/Scenario identity 歧义、rename 目标占用或其他 active Change 触达同一 Requirement。Buildr 已在最终 `openspec converge` 内通过 deterministic planner、active Change conflict scan 和 projected strict validation 处理这些事实，但暴露时点太晚。

本变更跨 OpenSpec Application、CLI surface 和 Contract Guard workflow。约束是：canonical writer 仍只能是 `converge`；Planning Review 只审计划，不承担 OpenSpec 解析；Agent 只处理产品返回的语义决定；预检不得形成可复用的写入授权。

## Goals / Non-Goals

**Goals:**

- 在 apply-ready 后、Planning Review 前提供一次只读 semantic readiness preflight。
- 复用正式 convergence planner 的 delta/canonical 语义，不复制第二套 omission、rename 或 identity 规则。
- 明确区分 `active-change-conflict`、`scenario-omission`、`identity-conflict`、`projected-validation` 和其他 `semantic-resolution-required` blocker。
- 让 ready 结果绑定当前 delta、canonical、全部 active Change observation、executable 与 algorithm identity，并明确任何输入变化都会使其失效。
- 最终 `converge` 始终重新读取最新事实、重新规划和重新验证。

**Non-Goals:**

- 不改变 Planning Review Application、Review Result schema 或 review target identity。
- 不让 preflight 写 canonical、Convergence Receipt、archive、Task/Review/Verification 状态或长期 sidecar。
- 不用 preflight 取代上游 strict validation、实现后验证或最终 converge。
- 不自动解决 active Change 顺序、补回省略 Scenario、选择 rename 或 identity 语义。

## Decisions

### 1. 新增 `openspec convergence preflight`，而不是扩展 Planning Review

该命令属于 OpenSpec Contract Guard，与 `convergence inspect` 同处 convergence namespace，但语义不同：preflight 检查尚未开始的收敛是否语义就绪，inspect 只读取已存在的事务 Receipt 做恢复观察。Planning Review 只在 preflight `ready` 后审查原有 planning target，不保存或解释 preflight 结果。

替代方案是把检查嵌入 Task Review。该方案会让 Review Application 理解 OpenSpec delta、canonical 和 active Change，破坏专业边界，因此不采用。

### 2. 抽取无副作用 planning input，并复用 `createConvergencePlan`

OpenSpec Application 读取当前 Change context、proposal capability descriptions、canonical snapshots、portable executable identity 和全部 active Change observations。它使用现有 active conflict detector 和 `createConvergencePlan` 生成同一 operations/files/blocked 判断；plan 无 blocker 时再对 expected files 运行现有 projected strict validation。preflight 不调用 checklist gate、receipt writer、canonical applier、actual confirmation 或 archive adapter。

替代方案是直接 dry-run `runOpenSpecConvergence`。该 orchestrator 包含 checklist 和事务写入阶段，即使增加 flag 也容易把只读与写入资格耦合，因此不采用。

### 3. 以 facade 分类既有 planner blocker

planner 保留现有精确 code/reason；preflight facade 额外给出稳定 `category`：

- 其他 active Change 触达相同 Requirement：`active-change-conflict`；
- `reason: scenario-identities-omitted`：`scenario-omission`；
- duplicate/not-unique/rename target/added identity 冲突：`identity-conflict`；
- expected Project strict 失败：`projected-validation`；
- 其余需要人工决定的结构语义：`semantic-resolution-required`。

Agent 根据 category 修订 Change artifact、处理 active Change 依赖或请求用户决定，之后重新运行 preflight。产品不生成自动合并或语义补全。

### 4. ready 是当前观察，不是持久授权

公共结果使用 `buildr.openspec-convergence-preflight/v1`，包含 `status: ready|blocked`、`readinessIdentity`、convergence/plan identity、delta digest、executable/algorithm identity、active Change observations、canonical before summaries、operations、blockers、validation、`effects: []` 和 next actions。

`readinessIdentity` 对 change/project、plan identity、按序排列的 active Change id/delta digest/validation observation 和 executable/algorithm identity做稳定摘要。结果只在这些输入保持不变时描述同一观察；不写数据库或 sidecar。最终 `converge` 不接受 readiness identity 参数，也不读取历史结果，必须重新构造当前 plan。

### 5. Contract Guard sidebar 负责调用与停止，Agent 负责语义处理

OpenSpec artifacts 达到 apply-ready 且上游 strict 通过后，sidebar 先调用 preflight。`ready` 才继续 planning identity resolver 和 Planning Review；`blocked` 则停止 Review/apply，并向 Agent 提供最小 blocker。active Change conflict 属于时序冲突，Agent 可先完成前序 Change 或合并/重划范围；omission/identity conflict 属于当前 Change 内在语义问题，Agent 必须修订 artifact 或请求决定。

## Risks / Trade-offs

- [预检后 canonical 或 dev 合入新改动] → readiness identity 立即陈旧；进入 Review 前可重跑，最终 `converge` 必须无条件按最新事实重查。
- [两条路径产生规则漂移] → preflight 只调用现有 planner/conflict detector/projected validator，分类 facade 不决定写入操作。
- [active Change 很多导致检查变慢] → 只解析同一 Project active Changes，稳定排序并报告 duration/commandCount；不缓存成新 authority。
- [用户把 ready 当作合入保证] → help、JSON next action 与 Skill 明确 ready 只证明当前观察，不能代替实现后验证或 final converge。
- [已有调用方依赖 OpenSpec help 只有两个命令] → 这是非破坏性新增命令；command metadata、帮助、unknown candidates 和 public schema 同步由现有 catalog/registry 验证。

## Migration Plan

1. 增加只读 Application 与针对 planner 分类、零写入、identity 失效的测试。
2. 注册 CLI descriptor 和公共 JSON schema，更新 help/surface 验证。
3. 更新 OpenSpec Contract Guard contribution，在 Planning Review 前调用 preflight。
4. 更新当前知识中的 OpenSpec lifecycle、technical boundary 和 glossary。
5. 通过 affected/full verification 后由现有 `converge` 收敛本 Change；无需数据迁移或历史结果 backfill。

回滚时删除新命令和 sidebar 调用即可；没有新持久状态需要清理。

## Open Questions

无。
