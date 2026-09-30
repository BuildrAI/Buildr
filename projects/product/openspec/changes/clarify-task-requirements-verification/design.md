## Context

见 proposal.md - Why。现状约束：

- `buildr-web-client` 现行需求是"需求节点默认显示任务目标正文，brief.md 作为补充说明材料在同层目录列出"——三层重复由此产生（头部 intent + "任务目标"项 + "需求说明"项）。
- `TaskNodeContent` 在 `requirements` 下 `unshift` 一个 `intent` 目录项，brief 等 `TaskDocumentItem` 由 `taskDocuments` 列出、`taskDocumentLabel` 命名"需求说明"。
- 「用户确认」目录项无条件创建（`selected === 'closeout'` 时始终 push `acceptance`）。
- `task verification record` 在 `completed` 后被拒（`task_verification_task_terminal`），而 `task-finish` 只写"未登记的审查或验证在任务仍为 active 时先补登"，没有把登记时点前置到实现完成；`openspec-apply-change` 的 sidebar 贡献（`components/buildr/openspec/contributions/openspec-apply-sidebar.md`，经 `skillFragments: openspec-apply-change@prepend` 接入）没有这个时点说明。
- `task-manager` 对 intent 只有"简洁清晰"的定性，没有长度与格式约束，导致完整需求被塞进 intent。

**Goals:**

- 信息架构：说明页单一阅读流——brief 为说明正文、intent 以短目标小节呈现；无 brief 则如实显示 intent。
- 语义：brief 正名"需求"（文件名与读取兼容不变）；移除「用户确认」。
- 时点：实现完成阶段即登记验证报告（任务 active），Skill 指引给出不可回头的边界。

**Non-Goals:**

- 不改 Task Record schema、`--intent` 参数或 `task verification` 写入语义。
- 不改验收流程本身或 `task work-context` 数据模型。

## Decisions

### 1. 需求节点：说明正文优先、intent 收为小节

说明页按"阅读需求"而不是"浏览对象"组织。实现上：

- `TaskNodeContent` 不再为 requirements 单独 `unshift` `intent` 项；brief 生成的 `TaskDocumentItem`（`说明`，由 `taskDocumentLabel` 更名）留在目录成为主选。
- `TaskReadingPane` 新增需求类型阅读对象：渲染 `record.intent` 作为"任务目标"小节，随后展示说明正文；无 brief 时直接渲染 intent（或空态），空 intent 如实提示。
- `taskWorkContent.taskDocumentLabel` 把 `brief.md` 显示名改为"说明"，stage 标签改为"任务说明"。头部 intent 展示不动——intent 短了之后自然就是入口定位，不需要新增截断交互。

这样非 change-flow 任务（无 brief）仍完整可读，意图 authority 不变；术语正名只是 UI 标签与文档表述，不改 `brief.md` 文件名或 openspec 契约。

### 2. 「用户确认」移除

`selected === 'closeout'` 不再 push `acceptance` 目录项，`TaskReadingPane` 不再渲染独立「用户确认」阅读内容；`result`、`coordination`、`retrospective` 等收尾内容保持不变。用户明确本轮删除，验收方案以后再定时按真实需求重新引入。

### 3. 验证报告时点与完整检查集合：写入技能本体 + apply 贡献 + finish 顺序

- `components/buildr/openspec/contributions/openspec-apply-sidebar.md`（`openspec-apply-change@prepend`）：在"实现完成后"的段落补"已执行且仍适用的检查在任务 `active` 时经 `task-verification` 登记为正式报告，`completed` 后槽位锁死不可补登"。
- `task-finish` 的"集中核对"行把补登顺序写明确：补登动作必须先于 `task complete`，而不是笼统"先补登"。
- `task-manager` 的 intent 条款补"一句话目标与入口"约束及反例（不塞多目标/步骤/验收）；`task-verification` 的 SKILL.md 与 `record-report.md` 明确"每次 record 是该时点任务相关完整检查集合、非增量"与"active 期间登记"语义。

`task-record` 的 `intent` 必填、`task verification record` 的 `active` 校验与原子替换语义不变；`task-review` 已按 current+完整历史设计，本变更不调整。

## Risks / Trade-offs

- [说明页只剩 brief 时 intent 被误读为已省略] → 说明页保留 intent 小节，目录标签为"需求"，历史任务的既有 `intent` 不丢可读入口。
- [已存在的长 intent 任务在旧页面上没有"任务目标"项] → intent 小节保留完整文本；头部展示也不截断，由"写短"约束未来内容而非裁剪历史。
- [「用户确认」移除使既有 acceptance 答复入口暂时消失] → 历史答复仍在 work-context 数据中，验收方案重新设计时按新信息架构恢复入口；本轮按用户决定先删。
- [指引改动不改变已完成任务的验证槽位] → 如实把"不可补登"写进指引；本任务漏登的例外按更正流程单独处置，不放宽校验。

## Migration Plan

- 无数据迁移：`TaskRecord.intent`、`brief.md`、`task_work_context` schema 与校验不变；只改展示与 Skill 文本。
- 历史任务：展示层兼容 —— 无 brief 照旧显示 intent；「用户确认」不再出现。
- 回滚：恢复目录项构建与文案即可，无持久格式变化。
