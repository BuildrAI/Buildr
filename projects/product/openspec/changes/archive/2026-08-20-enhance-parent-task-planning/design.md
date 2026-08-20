## Context

Parent Plan 当前是保存在 `task_development_current.record_json` 中的 closed value object，`buildr.parent-plan/v1` 以 `summary` 和可选 `plannedChildTaskId` 表达 Contribution。Parent Coordination Application 又把 `plannedChildTaskId` 与 Child Development `plannedContributions` 合并为同一个 `planned` disposition，导致预测信息能够排除 eligibility。Buildr Web 对所有 Task 请求并渲染 Parent coordination，同时把 Task Record、专业摘要和技术证据放在 Parent 核心计划之前。

本次变化跨越 Parent Domain、Task Development、Parent Coordination Application、CLI/HTTP JSON、React 页面、随包 Agent workflow 与 OpenSpec/current knowledge，但继续复用现有 Task/Environment/Development/Review/Verification/Finish authority。Preview 只提供信息层级参考，不是设计或验收 authority。

## Goals / Non-Goals

**Goals:**

- 用 `buildr.parent-plan/v2` 完整表达 Parent outcome、跨 Child 决策、结构化 work items、依赖、边界、预计 Child 与最终验收。
- 让预计 Child 永远只是计划说明；真实 Child binding 与交付只来自 Task Parent 关系、Development Contribution binding 和 matching handoff。
- 让 CLI/Application 同时、无歧义地表达预计信息、可启动性与真实运行处置。
- 保持 v1 dual-read，通过显式 `reconcile` 升级，不新增 SQLite migration 或 backfill。
- Parent、Child、普通 Task 使用不同的 Overview 信息层级，并保持技术事实可查看但默认折叠。

**Non-Goals:**

- 不迁移或修改 live `redesign-release-workflow` Parent。
- 不自动创建 Child，不从 UI、预计字段、Git、文件或 canonical specs 推断 binding/delivery。
- 不改变 Child 独立 Task/Environment/OpenSpec/Review/Verification/Finish 生命周期。
- 不引入第二个 Parent progress store、SQLite table、event history 或全局前端 Store。
- 不执行 npm、tag、GitHub Release 等正式发布。

## Decisions

### 1. v2 使用结构化 work item，依赖归属 work item

新 schema 使用：

```json
{
  "schemaVersion": "buildr.parent-plan/v2",
  "identity": "sha256-...",
  "outcome": "整体结果",
  "architectureDecisions": ["跨 Child 稳定决策"],
  "contributions": [
    {
      "id": "stable-id",
      "priority": "P0-1",
      "title": "可读标题",
      "objective": "本 work item 的目标",
      "directions": ["已确认实施方向"],
      "boundaries": ["不得越过的边界"],
      "expectedChild": "预计实施单元名称或目的",
      "dependencies": ["prerequisite-id"]
    }
  ],
  "finalAcceptance": ["最终集成验收"]
}
```

`priority` 是受长度限制的非空展示值，而不是封闭 enum，使 `P0-1`、`P1` 等既有规划语言可保真表达。Domain 按 `priority + id` 稳定排序；依赖数组按 ID 排序并继续校验 missing/self/cycle。选择 work-item 内依赖而不是继续顶层 edge，是为了让单项计划可独立读取和展示；v1 projector 仍把顶层 edge 转为对应 work item dependencies。

备选方案是保留 v1 `summary` 并继续加字段，或保留顶层 dependency edges。前者继续制造两套标题/目标语义，后者让 CLI/UI 必须再次拼接单项计划，因此不采用。

### 2. v1 原样验证，统一投影为 rich read model

Domain 暴露 v1/v2 常量并 dual-read：v1 identity 仍按原 payload 验证，v2 identity 覆盖全部新字段。Application 使用一个无写入的 compatibility projector：

- v1 `summary` → `title` 与 `objective`；`directions` / `boundaries` 为空；
- v1 `plannedChildTaskId` → `expectedChild`，只作为 legacy 预计信息；
- v1 顶层 dependency edges → work item `dependencies`；
- v1 `architectureInvariants` → `architectureDecisions`。

新 `record` 和 `reconcile` 输入只接受 v2。已有 v1 Parent 继续 inspect；升级时 caller 先 `inspect` 取得 current identity，再以完整 v2 input 执行已有 expected-identity `reconcile`。这是显式规划重写，会产生新 identity 和 stale Planning Review，但不直接操作 SQLite，也不自动更改 Child。

备选方案是读取时静默写回 v2，或增加一次性 SQLite migration。两者都会在 GET/升级时改变 authority 并破坏历史 identity，因此不采用。

### 3. 预计、可启动与真实处置是三个正交轴

每个 work item read model 分别返回：

- `expectation`: `expected | none` 与 `expectedChild` 文本；
- `eligibility`: `eligible | waiting-dependency | not-eligible`，并带可读依赖标题；
- `actual`: `unassigned | bound | active | delivered | residual | superseded | unproven`，真实 Child 另以 `actualChild` 返回 Task ID、title、Task status 与 binding evidence。

`expectedChild` 不进入 actual/eligibility 计算。只有直接 Child 且其 current Development 保存 matching Contribution binding 才能形成 `bound`；Child active 时投影为 `active`；matching Finish association 中的 Contribution Handoff 决定 `delivered/residual/superseded/unproven`。最终验收仍只接受 delivered 或 superseded。

备选方案是增加一个包含全部状态的单枚举。预计信息与 eligible 可以同时成立，单枚举会丢失合法组合，因此不采用。

### 4. Planning Review currentness 继续只依赖 Plan identity

v2 identity 覆盖 outcome、architecture decisions、priority、title、objective、directions、boundaries、expected Child、dependencies 与 final acceptance。任一计划内容变化都会使旧 Planning Review stale；Child Task status、actual binding、handoff 和 eligibility 派生变化不改变 Plan identity。`startup` 只有在 current ready Review 已被 Development planning gate 消费后才返回 eligible next。

### 5. coordination endpoint 按 Task 角色返回差异化模式

同一 Parent Coordination Application endpoint 返回：

- `parent-plan`：完整 Parent core view；
- `child`：Parent 链接、承接 work item 和 actual binding 的紧凑 `parentSource`；
- `ordinary`：无 Parent、无 Parent Plan 的普通 Task，零 Parent 主体；
- `legacy`：有历史 Parent/Child 关系但没有 Parent Plan，仅保留兼容 diagnostic，不显示大块空卡片。

Web 不跨 API 重算 Parent 状态。TaskDetail 仅按 read-model mode 选择 Parent 主体、Child 来源条或不渲染协调模块。

### 6. Parent Overview 以计划为主，技术事实折叠

Parent 模式按 outcome/next → work item 列表与完整详情 → architecture decisions → final acceptance 排列。列表显示 priority、title、objective 和状态；选中项显示 directions、dependencies（标题+ID）、boundaries、expected Child 和 actual Child。专业摘要、Task Record、digest/schema/storage、Environment 与空 Change/evidence 内容移入默认关闭的 `<details>` 或既有独立 Tab；普通与 Child Task 不显示 Parent 专属空态。

不引入全局 Store；选中 work item 使用 Parent panel 局部 state。保持现有 Ant Design、CSS token、路由和 API client。

## Risks / Trade-offs

- [v1 `plannedChildTaskId` 可能曾被当作真实 Child] → dual-read 只把它投影为 expected；真实关系和 Development binding 若确实存在，会独立恢复 actual Child，不丢失可证明事实。
- [v1 summary 到 rich model 的兼容投影信息有限] → 明确标记 legacy schema，允许读取但要求显式提交完整 v2 才完成升级。
- [三个轴比单状态字段更复杂] → 固定 closed value、类型和测试矩阵，避免 UI/CLI 自行猜组合。
- [Task Overview 重组可能影响浏览器钩子] → 保留既有 route 与关键稳定 DOM ID，为新 Parent/Child/ordinary 模式增加 browser smoke。
- [web-dist 容易与源码漂移] → 只在候选 worktree 构建，验证 staging 与 tracked `web-dist` 精确一致后交付。

## Migration Plan

1. 先交付 dual-read、v2 writer/read model 与测试；既有 v1 records 不变化。
2. 新 Parent 通过 `task parent record --input <v2>` 写入 v2；CLI `--schema/--example` 只展示 v2。
3. v1 Parent 通过 `inspect → 准备完整 v2 JSON → reconcile --expected-plan <v1 identity>` 显式升级；旧 Planning Review 自动 stale，随后重新 Planning Review 与 `refresh-planning`。
4. 本任务不执行任何 live Parent 升级。若需要回滚产品实现，历史 v1 数据仍可由旧版本读取；已写 v2 的 Task 需要保留当前版本或先由新版本显式 reconcile 回兼容计划，禁止 SQL 降级。

## Open Questions

无。Preview 中的 `P0-1` 等表达证明 priority 需要保留自由文本；其余语义由现有 authority 与本设计闭合。
