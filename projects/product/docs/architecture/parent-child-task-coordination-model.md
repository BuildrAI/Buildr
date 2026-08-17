# 父子任务协调模型

## 1. 模型目标

Buildr 的父子任务模型采用“Parent 协调结果，Child 独立交付变化”的分工：

- Parent Task 是最终 outcome、architecture invariants、Contribution Map、依赖与 final acceptance 的协调 authority。
- Child Task 是一个或多个 Contribution 的独立交付单元，拥有自己的 Environment、窄 OpenSpec Change、Development、Review、Verification 与 Finish。
- canonical specs 保存已经归档的当前产品契约；同一个具体规范变化同一时间只能由一个 active Change 持有。
- Child 完成不等于 Parent 完成。Parent 必须显式完成最终集成验收，再走正常 Completion Review、Development handoff 与 Formal Finish。

该模型是 opt-in、forward-compatible 的长期能力。没有 Parent Plan 的历史 Task 保持 `legacy` 模式，不扫描、不回填、不迁移，也不从旧 Change、`tasks.md`、代码或 canonical specs 推断 Contribution。

## 2. Authority 边界

| 事实 | 唯一 authority | 明确不保存 |
|---|---|---|
| Task identity、顶层 active/completed/abandoned、直接 Parent/Children | Task Record / SQLite `tasks` | Parent Plan、Child Result、专业状态副本 |
| Parent 协调计划 | Task Development current Receipt 中的 `parentPlan` | Child status、完整 Requirement/delta、字段/migration/file checklist、checkbox进度 |
| Child planned Contribution | Child Task Development current Receipt 中的 `plannedContributions` | Parent current status、Child delivery结论 |
| Child/Parent 实际 Contribution 交付 | 既有 immutable Development handoff 中的 `contributionHandoff`，并由 Finish terminal association 证明 Child delivery | 第二套 Result、registry、event/history/audit log |
| Parent Planning Review | Task Review planning slot，target 为 Parent Plan identity | Child lifecycle、Verification或Change archive状态 |
| Parent 最终集成验收 | Parent Task Development current Receipt 中的 `parentAcceptance` | Parent completed状态或自动Finish |
| 当前规范契约 | canonical OpenSpec specs | active Parent/Child计划副本 |
| Parent progress | Parent Coordination Application 动态 read model | 物化count、status array、lifecycle cache、progress表 |

所有长期事实仍写入已有 `task_development_current.record_json` 整值 authority。Receipt 写入版本为 `buildr.task-development-receipt/v3`；SQLite table shape和migration ledger不变，因此没有新表、数据迁移或历史 backfill。v1/v2 Receipt只读归一化为 `parentPlan: null`、`plannedContributions: []`、`parentAcceptance: null`。

## 3. Parent Plan

Parent Plan 是 closed、内容寻址的协调值对象：

```json
{
  "schemaVersion": "buildr.parent-plan/v1",
  "identity": "sha256-...",
  "outcome": "最终需要形成的整体结果",
  "architectureInvariants": ["一个事实只有一个authority"],
  "contributions": [
    {
      "id": "independent-child-delivery",
      "summary": "Child可以独立归档窄Change并形成可证明交付",
      "plannedChildTaskId": "child-task-id"
    }
  ],
  "dependencies": [
    {
      "contributionId": "final-integration",
      "dependsOn": "independent-child-delivery"
    }
  ],
  "finalAcceptance": ["全部Contribution已证明delivered或明确superseded"]
}
```

Domain会排序数组、拒绝重复与未知引用、拒绝循环依赖，并从上述协调内容派生identity。Child status、Review/Verification Result、Change lifecycle和实现细节不进入identity，所以普通执行状态变化不会使Parent Planning Review stale。

首次采用使用 `record`；Plan已存在后只能提交current expected identity、完整next Plan和非空reason执行 `reconcile`。reconciliation只更新计划，不自动修改任何Child Task、Change或handoff。

### 3.1 Parent 启动顺序

Parent推进到首个Child之前遵循：active Task → matching ready Parent Environment → Development begin → Parent Plan record → current Planning Review → `task parent refresh-planning`消费Review → 选择一个依赖已满足的eligible Contribution。`task next`只读返回当前唯一next，不自动执行Review、refresh或Child创建。

纯协调且在Child前不修改交付内容的Parent可以使用明确的coordination-only共享执行根；Parent会直接修改代码、文档或其他生产内容时使用隔离checkout。Child始终准备自己的Environment；若Child依赖尚未进入canonical baseline的Parent交付，必须等对应前置Contribution正式交付后再prepare Child Environment。

`task parent record|reconcile --schema|--example`公开closed输入结构。`refresh-planning`不接收caller重构的planning JSON，只复用saved Parent Plan、matching planning snapshot与current ready Planning Review；Plan或Review漂移时零写入并要求重新inspect。

## 4. Child 独立交付

Child 的创建顺序是：

1. 基于最新统一 `dev` 创建带 `--parent` 的Task Record，初始不引用Parent Change。
2. 准备Child自己的matching Environment，建立Development Receipt。
3. 把Child绑定到current Parent Plan中的一个或多个Contribution。
4. 在Child execution root创建自己的窄Change，完成Planning Review、实现、Verification、Completion Review与Development handoff。
5. 独立converge/archive Change，经Formal Finish合入最新`dev`。

Parent Plan不是OpenSpec Change；Parent若亲自交付集成代码，可以拥有自己的窄Change，并把对应Contribution的`plannedChildTaskId`设为Parent Task ID。Parent Change不得覆盖所有Child delta。

## 5. Contribution Handoff

承担Parent Contribution的Task在正式Development handoff中提供：

```json
{
  "parentTaskId": "parent-task-id",
  "planned": ["planned-contribution"],
  "delivered": ["planned-contribution"],
  "extra": [{ "contributionId": "later-capability", "summary": "提前交付的结果" }],
  "residual": [{ "contributionId": "remaining-scope", "summary": "仍需交付的范围" }],
  "superseded": [{
    "contributionId": "future-child-scope",
    "deliveredByContributionId": "later-capability",
    "reason": "范围已被可证明交付完全覆盖"
  }],
  "affected": [{ "contributionId": "documentation", "summary": "后续文档范围缩小" }],
  "nextAction": "Parent owner执行一次显式reconcile"
}
```

Application要求：

- `parentTaskId`与Task Record Parent一致；Parent自身交付时与自身Task ID一致。
- `planned`精确匹配已保存binding或Parent Plan中由Parent亲自承担的Contribution。
- 全部引用属于current Parent Plan；planned delivery放入`delivered`，越界交付放入`extra`。
- handoff仍是既有Candidate/gates/decision snapshot的一部分，append-only且immutable。

Child顶层`completed`但没有与Finish completion association匹配的Contribution Handoff时，read model必须返回`unproven`，不能假设原计划已经完整交付。

## 6. 派生 read model

`Parent Coordination Application`是唯一组合边界。它通过Task Record、Task Development、Task Review与Task Terminal Delivery Applications读取已保存事实，返回：

- Parent Plan、Parent status、Planning Review与显式final acceptance；
- 每个直接Child的identity、顶层状态、planned binding、matching handoff与diagnostic；
- 每个Contribution的`unassigned | planned | delivered | residual | superseded | unproven` disposition；
- `prerequisitesSatisfied`、blockers与`finalAcceptanceReady`。

Application不直接查询SQLite，不在GET/inspect时扫描文件系统，不回填历史事实。CLI `task parent ...`、Buildr Web `/api/v1/tasks/:id/coordination`和Agent workflow都消费这一Application；Web层不再拼装自己的进度算法。

`prerequisitesSatisfied`只表示全部Contribution已由saved delivery或明确superseded处置。它不改变Parent Task Record。`task parent accept`记录显式最终集成验收后，Parent仍保持active，直到正常Formal Finish完成。

## 7. 范围变化与 reconciliation

Child可以在自己承担的Contribution内细化实现。出现以下任一变化时必须显式reconcile：跨越其他Contribution、提前交付后续Contribution、改变依赖顺序、architecture invariants或final acceptance，或者使未来Child范围缩小/消失。

- 部分覆盖：保留后续Contribution的residual scope；若Child已创建，更新其intent和窄Change，只留下residual。
- 全部覆盖：Plan表达实际delivery/superseded；未来Child未创建则不再创建，已创建则Task Record `abandon`，不能标记completed。
- 无法由saved handoff证明：保持planned/unproven，不从代码、文件或canonical specs猜测。

Reconcile产生新Plan identity并使旧Parent Planning Review stale。只改变Child status、Verification、Change lifecycle或Finish且不改变Plan时，不执行reconcile，Plan bytes与Review applicability保持不变。

已经被Child planned binding或saved handoff引用的Contribution不能直接从next Plan删除；应保留该Contribution并表达residual或superseded处置。这防止reconcile制造无法解释的孤儿binding，同时仍允许删除尚未创建、未绑定且没有交付事实的未来Contribution。

## 8. 历史兼容与禁止项

历史Task继续支持inspect、恢复、更新、完成和放弃；已有Parent/Child关系不变。系统不做以下工作：

- 扫描历史Parent并生成Plan或Contribution；
- 改写旧Parent Change或`tasks.md`；
- 为特定Task增加migration逻辑；
- 恢复`task_lifecycle_current`或建立Parent lifecycle/progress/event/history/audit authority；
- 在`tasks`写任意JSON、Child status array或completed count；
- 用Markdown checkbox与数据库双写；
- 在读取时扫描文件系统或从canonical spec反推delivery。

历史Parent如需采用新模型，由独立治理Task显式提取Parent Plan、停止重复delta authority、按已有saved handoff重算residual scope并重做Planning Review。这是一次规划重写，不是数据库migration。

## 9. 操作入口

```bash
buildr task parent inspect <parent-task-id> --target <workspace> --json
buildr task parent record <parent-task-id> --input <parent-plan.json> --target <workspace> --json
buildr task parent bind-child <child-task-id> --parent <parent-task-id> --contribution <id> --target <workspace> --json
buildr task parent reconcile <parent-task-id> --expected-plan <identity> --input <next-plan.json> --reason <text> --target <workspace> --json
buildr task parent accept <parent-task-id> --expected-plan <identity> --summary <text> --target <workspace> --json
```

Contribution Handoff由`task-development`内部driver在正式handoff动作中提交，不手写SQLite Receipt。Child Change ownership继续由OpenSpec专业流程和contract guard检查。
