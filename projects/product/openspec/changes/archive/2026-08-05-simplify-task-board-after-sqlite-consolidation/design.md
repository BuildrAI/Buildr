## Context

Workspace SQLite 已成为 Task Record、Development current record、Verification current Result 与 Planning/Completion Review current Results 的本机 authority，Parent/Child 已提供最小协调关系，Local App 通过各专业 Application/read model 动态展示这些事实。现有 `task-board` 则要求 Agent 另行生成静态 HTML，并在其中维护 `batches`、`dependencyPool`、进度、决策与证据摘要。仓库审计没有找到 Local App、CLI、Application 或生产自动化 consumer；当前调用链只有 Task Triage 条件路由和 Agent 直接加载 Skill。

现有 `projects/product/openspec/knowledge/task-boards/*.html` 与 `task-cockpits/*.html` 记录了历史任务过程，属于明确保护资产。它们的存在不能证明生成能力仍应保留，也不能在本次清退中被迁移、重写或删除。

## Goals / Non-Goals

**Goals:**

- 完整清退无真实 consumer 的静态 Task Board 当前能力及其 package/runtime 投射。
- 消除 canonical specs、产品说明与 Roadmap 对“当前 Board Skill”的冲突。
- 让 Task Triage 只判断语义治理与执行形态；正式任务协调使用 Task Record、Parent/Child、专业 current records 和 Local App 动态投影。
- 保证历史 `task-boards/*.html` 与 `task-cockpits/*.html` 路径和内容不变。
- 保持 P1.1 Structured Task Board 为真实缺口出现后才触发的有限探索。

**Non-Goals:**

- 不创建 Board Domain、Board ID、writer、状态机、数据库表或 Local App Board 页面。
- 不把 batches、dependencyPool、依赖、排序、分组或 Board progress 塞入 Task Record。
- 不修改 Workspace SQLite schema，不恢复 Task Metadata Publication。
- 不为非 Task 规划项、多人协作或未来 Cloud 场景预建能力。

## Decisions

### 1. 完整清退，而不是保留最薄 Board

审计未发现 Parent/Child 与 Local App 无法覆盖的真实 consumer。`task-board` 的剩余价值只有静态浏览历史，而历史文件无需当前 writer 继续存在。因此删除 Skill、contract、provider、binding、Task Triage 分支、template、专属 validation 与 tests，不建立替代 Board abstraction。

### 2. 历史页面是不可变历史旁证

两个历史目录继续保留在原位置，但不再属于 current knowledge maintenance 或可执行任务工作流。实现和验证将记录变更前后文件清单与内容 hash，确保本 Change 不修改这些页面。旧页面中的旧术语和陈旧状态按历史原文保留。

### 3. 当前协调只组合既有 authority

顶层状态与 Parent/Child 由 Task Record Application 提供；Development、Review、Verification 分别由各自 Application/read model 提供；Local App 只消费这些 read model。Task Triage 不再输出第三个 Board tracking axis，也不直接访问 SQLite。

### 4. Package 清退通过 manifest-first 同步完成

canonical package source 删除 Task Board builtin、capability contract、binding、baseline entry 和 runtime navigation。已有 workspace 在 sync 时由既有 managed-orphan reconciliation 删除受管的 `skills/buildr/task-board`、contract、runtime projection 与 receipts；修改过或非 Buildr-owned 的输出继续 fail closed。

### 5. 只删除 Task Board 专属 replacement 兼容

`task-cockpit → task-board` 未形成当前真实 consumer，因此删除其 `replaces`/legacy integrity 声明及专属 upgrade test。通用 builtin replacement 引擎仍被 `git-operations ← git-ops` 使用，予以保留；通用单元测试改用该真实 consumer 的中性 fixture，避免继续把 Task Board 当作价值依据。

### 6. P1.1 继续条件触发

Roadmap 只保留有限探索：只有实际使用证明 Parent/Child 无法覆盖非 Task 规划项、多协调者成员、显式依赖、稳定排序/分组或跨 Task 决策记录时，才允许另行提案。该方向不是本次实现的残余能力。

## Risks / Trade-offs

- **旧 workspace 仍有受管投射**：由现有 manifest-first orphan reconciliation 清理，并用临时 workspace upgrade test 与 retained runtime sync 验证。
- **用户仍用“任务看板”表达进度意图**：Agent 通过普通对话、Task/Parent 状态与 Local App 当前视图回应，不再生成静态页面。
- **历史页面显示陈旧状态**：这是历史原文保护的代价；产品文档会明确它们不是 current authority。
- **未来出现结构化协调缺口**：记录在 P1.1，届时以真实 consumer evidence 启动独立 Change，不在本次保留预防性框架。

## Migration Plan

1. 更新 canonical specs、产品说明、文档索引与 Roadmap，明确退役和历史保护边界。
2. 从 package source、baseline、runtime navigation、Task Triage 与 static validation 删除 Task Board。
3. 删除专属 contract、template、contract/upgrade tests；保留并中性化通用 replacement unit coverage。
4. 验证 package check、affected tests、OpenSpec strict validation，并验证历史 HTML hash 未变。
5. 完成正式 Task Verification、Change converge、Candidate/Review/Finish。
6. retained runtime sync 删除当前 workspace 投射，Doctor 证明 capability graph、runtime 与 receipts 已收敛。

回滚只能通过新的窄 Change 恢复 package/spec 行为；历史 HTML 不参与回滚，也不得被当作可执行源重新接管。

## Open Questions

无。当前没有支持保留 Board 能力的真实 consumer evidence。
