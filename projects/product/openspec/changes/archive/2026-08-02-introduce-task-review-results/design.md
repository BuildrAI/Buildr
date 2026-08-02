## Context

P0.1 已建立正式 Task Record，P0.2 已建立 canonical Task Environment、隔离执行根和 Task-scoped Change Resolver。当前产品仍没有 Task 级语义审查结果：Local App 的 Change “审查”只生成一次性 Agent prompt，`task-asset-review` 则拥有长期资产 observation/复盘，两者都不提供绑定目标 identity 的可移植 Review evidence。

Roadmap 原先把 Planning Review 与 Completion Review描述为两个检查点，并为 Result 预设 `revision`、current 引用和 handoff 快照。进一步审查后需要收窄：两个检查点确实绑定不同目标、不能互相覆盖，但它们不需要两套 schema、两个 Skill 或 Task 创建时的必填记录；当前也没有多人编辑、历史寻址或 Result 内部 mutation 证明持久 revision 有价值。

本 Change 必须在 P0.5 Task Development/Candidate 之前建立可独立实现和测试的数据能力，但不能为了提前显示“适用”而生成伪 plan context、伪 Candidate 或通用内容 fingerprint。P0.3 只消费调用方已经确定的 opaque target identity，并提供确定性比较。

## Goals / Non-Goals

**Goals:**

- 用一个 `TaskReviewResult` 数据模型表达 Planning/Completion 两个可选 current 槽位。
- 让完整 Result 成为 canonical Workspace 中可移植、Git 跟踪的轻量 evidence。
- 固化唯一 writer、closed schema、精确文件 ownership、原子替换和中断不覆盖。
- 通过 target identity 比较派生适用性，不持久化易陈旧的 `current/applicability`。
- 让 Agent、CLI 和 Local App 复用同一 Application/read model。
- 切换正式 Task-scoped Change review route，同时保留普通 Change review 与 `task-asset-review` 的独立 authority。
- 为未来 Development handoff 提供足够但不重复的 Result reference。

**Non-Goals:**

- 不实现 Task Development、Candidate identity/generation、handoff gate 或 lifecycle 状态机。
- 不实现 Review Run、draft、队列、历史、finding resolution、审批流或 reviewer registry。
- 不执行语义审查，不把 Buildr 变成通用 reviewer，也不固化特定审阅清单。
- 不替代 Task Verification，不保存完整测试 evidence，不证明真实 Agent session 或独立 Agent identity。
- 不把 Review 字段、path、digest 或适用性复制进 Task Record、Environment Receipt 或 Finish Receipt。
- 不清退或改造 `task-asset-review` 的 observation、人工决定与独立资产任务交接。

## Decisions

### 1. 一个 Result 实体、两个可选 current 槽位，不创建 Review Receipt

每个 Task 只有以下关系：

```text
Task
├── planning:   0..1 TaskReviewResult
└── completion: 0..1 TaskReviewResult
```

文件固定为：

```text
<canonical-workspace>/.buildr/tasks/<task-id>/reviews/planning.yml
<canonical-workspace>/.buildr/tasks/<task-id>/reviews/completion.yml
```

目录和文件名定义 current slot，文件内 `reviewType` 使 Result 脱离目录后仍可自描述，并必须与 slot 一致。Task 创建、Environment prepare 或读取详情都不创建空目录/空文件；缺失只表示该类型没有 current Result，不等于未通过、跳过或不适用。

不增加 `review.yml`、`reviews.yml` 或 Task Review Receipt。Receipt 适合持有可恢复的过程/副作用状态；本能力只保存一次完整语义审查形成的值对象。两份 Result 同时存在时，它们分别绑定 plan context 和 Candidate，不存在全局唯一的“当前审查”。

**替代方案：** 单一列表或总 reviews 文件。它会引入 history/排序语义，并让更新一个类型时读取后改写另一个类型，增加不必要的交叉覆盖风险，因此不采用。

### 2. v1 只保存最小 closed 数据模型

Application 生成以下 canonical YAML：

```yaml
schemaVersion: buildr.task-review-result/v1
taskId: introduce-task-review-results
reviewType: planning
targetIdentity: "plan:opaque-identity"
method: self
reviewed:
  - "task intent"
  - "change:product/introduce-task-review-results"
uncovered: []
findings: []
conclusion:
  outcome: ready
  summary: "方案边界清晰，可以进入实现"
completedAt: "2026-08-02T00:00:00.000Z"
```

字段约束：

- `reviewType` 仅为 `planning|completion`；两种类型使用完全相同的 schema。
- `targetIdentity` 是调用方提供的非空 opaque stable identity。Application 不解释其组成，也不把文件路径、Environment 或 policy 另建为 target components。
- `method` 仅为 `self|independent-agent|human`；不保存 reviewer、session、model 或证明材料，Skill 必须如实选择。
- `reviewed` 是至少一个可移植逻辑引用或简洁对象标签；v1 不建设通用引用 registry 或 authority taxonomy。
- `uncovered` 是 `{subject, reason}` 列表，可以为空；相关但未覆盖的对象必须如实列出。
- `findings` 首版是字符串列表，不分配 ID、severity、owner、status 或 resolution。
- `conclusion.outcome` 仅为 `ready|changes-required`，`summary` 必须非空。Review 无法形成完整结论时不写 Result；已完整确认的外部阻碍以 `changes-required` 和 finding 表达，Task/Development 决定是否 blocked。
- `completedAt` 由 Application 使用系统时间生成，不接受调用方 next-state 值。

绝对本机路径、凭证、完整日志、隐藏推理和 lifecycle receipt 内容不得作为结构化 reviewed/uncovered 引用写入。需要说明本机诊断时只能保留可移植的最小摘要。

**替代方案：** 首版引入结构化 finding/evidence/authority/actor。当前没有 finding 生命周期、审批、统计或跨结果查询 consumer，先引入会把预测需求固化成契约，因此留给真实实践后的 schema v2。

### 3. Result 不持久化 revision，以 canonical bytes digest 作为值 identity

一份完成后的 `TaskReviewResult` 是不可变值；变化通过完整的新 Result 替换 current slot，不通过修改旧 Result 的 revision 表达。reader 对 canonical bytes 计算 `resultDigest`，只在 operation response/read model 返回，不写入 YAML。

首版没有 Local App Result 编辑器、多人编辑、历史寻址或 merge，所以不增加 revision、expected revision、锁、CAS 或租约。若未来出现直接 UI authoring 与陈旧页面覆盖问题，可以像 Task Record 一样使用 response-only digest 作为条件写入；该需求不反向证明现在需要持久 revision。

未来 Development handoff 若采用某份 Result，只冻结最小不可变引用：

```yaml
reviewEvidence:
  planning:
    resultDigest: "sha256-..."
    targetIdentity: "plan:..."
    method: self
    outcome: ready
    summary: "..."
  completion:
    resultDigest: "sha256-..."
    targetIdentity: "candidate:..."
    method: independent-agent
    outcome: ready
    summary: "..."
```

P0.3 不创建或修改 Development Receipt。active Development 也不需要持续复制两个 current 引用；它可以在形成 handoff 时读取 current slots，避免第二套 current pointer。

### 4. 适用性是 target 关系，不是持久状态

Task Review Application 的 read operation 接受每种类型可选的 `currentTargetIdentity`，按以下规则派生：

```text
Result 缺失                         -> slot missing，applicability null
Result 存在、current target 未提供   -> unknown
Result.targetIdentity 完全相等       -> current
Result.targetIdentity 不相等         -> stale
```

只有 `current` 可以满足未来 consumer gate；`stale` 与 `unknown` 都不能被描述为仍适用。target 变化不删除或改写旧 Result，旧 Result 继续作为“曾审查过什么”的事实留在 current slot，直到同类型下一份完整 Result 原子替换它。

Planning target identity 的语义来源是当时的 Task Intent/plan context；Completion target identity 必须是 current Candidate identity。P0.3 只验证调用方确实提供 identity，不生成两者。没有 Candidate identity 时，Completion record 必须 blocked，不能用 HEAD、dirty tree、Environment identity 或任意时间戳伪造 Candidate。

Review 执行方式是否满足某项 Project/用户政策属于未来 Development gate，不是 target applicability。P0.3 不保存 policy identity；后续 consumer 可以同时检查 `method` 与自身政策。

### 5. 一个 Application 独占两个文件，CLI 和 Local App 都是客户端

Task Review Application 提供两个动作：

| 动作 | 责任 |
|---|---|
| `inspect` | 验证正式 Task，分别读取两个可选文件，返回 digest 与派生 applicability；零写入 |
| `record` | 接收一份完整语义结果，补齐系统字段，完整校验后精确原子替换对应 slot |

公开 CLI 仅暴露：

```text
buildr task review inspect <task-id>
buildr task review record <task-id> --type <planning|completion> ...
```

CLI 只解析结构化字段和 canonical `--target`，不接受完整 next-state YAML、caller path、schemaVersion、taskId、completedAt、revision、current 或 applicability。复杂列表可以采用明确的 repeatable flags/结构化值；具体 argv 编码可以在实现中沿用现有 option parser，但不得改变 Application 输入边界。

两个命令使用 `buildr.task-review-operation-result/v1` response：

```text
operation、status、taskId
slots.planning / slots.completion:
  path、present、result、resultDigest、applicability
diagnostic、effects、nextActions
```

`record` 只在 active Task 上成立；`inspect` 可以读取 terminal Task。Review metadata 写入 canonical Workspace，不要求把本机 Environment facts写入 Result；语义 Review 若需要读取实现，Agent 仍必须遵守 Task Environment 的执行根。

Repository 对每次写入都重新读取/校验当前文件，用同目录临时文件和 rename 替换一个精确 slot。输入校验、临时写入、rename 或 post-write read 失败时保留旧 bytes 和全部 sibling files，只清理可证明属于本次写入的临时文件。首版约束同 Task/type 单一 active writer，不建设并发协调协议。

### 6. Skill 执行语义审查，但不保存运行过程

新增 `buildr.task-review/v1` capability contract 与默认 optional `task-review` Skill。Skill 根据用户意图、Task Intent、Project authority、实际计划/实现和风险动态确定 reviewed/uncovered；不能把 OpenSpec proposal/design/tasks 或固定测试清单写成所有任务的必选对象。

Skill 在开始时确认 Review 类型和明确 target identity，执行中只形成会话内 working facts；只有正常完成后调用 `record`。中断、工具失败、证据不足或无法形成完整结论时不调用 writer，并明确报告旧 current Result 是否因 target mismatch 已 stale。

`planning` 与 `completion` 都只是 Skill 的参数，不是两项 capability。P0.3 不要求每个 Task 执行任一类型；未来 Task Development 决定何时调用、是否需要独立 Agent/人工方式，以及何种结果满足 handoff。

### 7. Local App 组合专业 read model，不编辑 evidence

Task 详情在“概览”“环境”之外增加“审查”页签。Workspace-scoped `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/reviews` 必须先验证已登记 Workspace/Task，再直接调用 Task Review Application `inspect`；HTTP/Web 层不接收 filesystem path，不读取 YAML，也不自行判断 digest/applicability。

页面为两个固定槽位分别展示：

- 未产生，或 Result 已存在；
- `current/stale/unknown`（只有 Application 获得 current target 时才能显示 current/stale）；
- target identity、method、completedAt、outcome/summary；
- reviewed、uncovered 及 findings。

Local App 提供“交给 Agent 审查/重新审查”prompt action，不提供直接 record/edit、历史、删除、finding 状态和持续轮询。P0.5 尚未提供 current target 时页面必须显示 `unknown`，不能把 slot 中最新文件误标为适用。

正式 Task-scoped Change 详情的审查按钮携带 Task ID、`reviewType: planning` 与限定 Change 引用，路由到同一 Task Review prompt。Workspace 全局 Change 页面没有 Task/target identity，继续保留普通只读 Change review；它不是 Task Review Result writer。现有 `task-asset-review` 继续只处理资产 observation。

### 8. 没有旧 Result 数据迁移，只做 route/fixture authority cutover

当前审计没有发现正式 Task Review Result store、schema、writer 或 capability；`.buildr/tasks/**/review.yml` 只出现在 sibling-file preservation fixtures，不是可达 authority。实现不得把未知 sibling 文件猜测为旧 Result，也不得删除用户数据。

同一 Change 中需要完成：

- 新 Application/CLI/API/Skill/binding 成为唯一正式 Task Review writer/route；
- task-scoped Change review action 切到 Planning Review；
- 旧通用 Change review 只保留非 Task context；
- preservation fixtures 改为覆盖新的 `reviews/` sibling ownership，同时继续证明 Task Record/Environment 不触碰专业文件；
- package/static residual gate 拒绝第二个 Task Review store/writer、两套 Review type capability 或 Task Record/Environment Review 字段。

不迁移、重命名或退休 `task-asset-review`。名称相近不代表 authority 重叠。

## Risks / Trade-offs

- **[P0.5 之前缺少真实 Candidate identity]** → Completion slot 可以实现和测试，但没有明确 Candidate 时 record 必须 blocked；Local App 如实显示 missing/unknown，不建设临时候选。
- **[opaque target identity 无法由 Review Application独立重算]** → P0.3 只负责绑定与比较；identity producer 必须由调用方/未来 Development 明确。把组成提前固化会越界进入 Candidate/plan generation。
- **[字符串 findings 不利于未来查询]** → 当前只需要可读 evidence；等真实 finding lifecycle/统计 consumer 出现后再用 schema v2 结构化，不在 v1 猜字段。
- **[无 revision 不能协调同类型并发 record]** → 首版声明同 Task/type 单 active writer；每次只记录完成值并原子替换。出现真实 UI authoring/并发后再评估 digest precondition。
- **[Local App applicability 可能为 unknown]** → 明确区分“slot 中有结果”和“结果仍适用”；unknown fail closed 比伪造 current 更可靠。
- **[Task-scoped Change review route 改变既有 prompt]** → 只改变有明确 Task context 的按钮，并增加 contract/browser test；全局 Change review 保持原行为。

## Migration Plan

1. 实现 Result Domain/repository/Application 与 operation response，先保持现有 review routes 不变。
2. 实现 CLI、Skill/capability contract、package/runtime mapping和 Task Review专项 unit/integration tests。
3. 实现 Local App Review API/tab/Agent action，并验证 Task Record、Environment 与 Review 文件互不写入。
4. 将 Task-scoped Change review action 一次切换到 Planning Review，保留全局普通 Change review；运行 residual gate 确认没有第二 writer/route。
5. 校准 roadmap 的 optional slots、无 revision、派生 applicability 和未来 handoff snapshot 表述；完成 current knowledge reconcile。
6. 在 task worktree 完成 strict OpenSpec、package/runtime/CLI/Local App 与产品 Candidate 验证。候选集成后才从 retained source sync/render/doctor，使新 Skill 与 authority 正式生效。

回滚只能整体撤回新 capability/route；不得保留已启用 writer 却恢复旧 task-scoped prompt。已产生的 `reviews/*.yml` 是可移植用户数据，回滚代码不得删除或改写。

## Open Questions

没有需要用户决定的阻塞语义。CLI 对列表字段采用何种现有 option 编码、内部模块文件名和测试分组可以在实现时按当前架构选择，但不得改变本设计的数据模型、authority、target applicability、Local App 只读边界或非目标。
