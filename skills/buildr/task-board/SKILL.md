---
name: task-board
description: 为跨批次、跨 change、跨团队或跨会话的复杂任务创建或更新只读任务看板；用户明确要求任务看板、整体进度、长期跟踪或使用旧称“任务驾驶舱”时也使用。简单任务不使用。
---

# Task Board Skill

本 Skill 是 `buildr.task-board-maintenance/v1` 的默认 provider。任务看板由 Agent 单向维护，是完整任务的可视化入口，不是 OpenSpec change 的翻译，也不替代代码、验证或外部系统事实。

## 1. 适用范围

用户明确要求任务看板、整体进度或长期跟踪时使用；旧称“任务驾驶舱”只用于路由，当前回复和新产物统一使用“任务看板”。未明确要求时，仅为跨批次、change、服务、代码仓、团队或会话，存在外部依赖、等待事项或多次用户判断的复杂任务维护看板。简单、短时且无持续跟踪价值的任务用对话汇报。

看板以用户确认的完整任务或迭代为范围，不等同于单个 change，也不因 change 归档而结束。

## 2. 输入与事实

执行前确认：

- operation：`create` 或 `update`；
- canonical retained Workspace、Task Manager 已确认的稳定 kebab-case `task-id`、拥有任务的 Project 和当前写入授权；
- 已核实任务事实与来源；OpenSpec changes 是 `0..N` 个真实 OpenSpec change ids，没有 change 时使用空集合，不创建或猜测 planned identity。

按相关性读取用户确认、OpenSpec artifacts/status、代码与提交、验证结果、外部协作依赖和既有看板。来源冲突时修正看板，不用看板覆盖权威事实。决定改变 requirement、状态流、API、权限或数据语义时，先交给 `task-triage` 判断是否进入 change-flow；普通进度、批次关系、外部等待和验证结论可直接更新。

## 3. 定位与操作

1. 使用上游明确提供的 canonical Workspace 和 Task ID 调用 Task Manager `inspect`；不得从 cwd、父目录、worktree、分支或 Environment Receipt 推断 retained root。需要环境事实时只调用 Task Environment `inspect`，并只把 read model 当作进度来源，不把任务验证工作区当作看板 authority。随后结合 Project registry 和任务范围解析 Project。
2. 只在 retained Workspace checkout 按完整文件名 `yyyy-MM-dd-<task-id>.html` 查找 `projects/<project>/openspec/knowledge/task-boards/yyyy-MM-dd-<task-id>.html`，并核对候选内嵌 `meta.taskId`。只有一个 identity 一致的候选可以更新；多个候选、identity 不一致或目标冲突均返回 `blocked`。
3. `create` 没有候选时，以 retained Workspace 所在环境的首次创建日期生成稳定路径；已有同 identity 候选时复用它，不创建第二份。`update` 找不到候选时返回 `blocked`。
4. 从当前 runtime Skill 目录复制 `assets/task-board-template.html`，只更新 `script#board-data` JSON 和必要的任务专属文案。保持单文件，不重新手写模板，不依赖 workspace 源目录、CDN、远端脚本、字体或图片。

新任务只写入 `task-boards/`。既有 `task-cockpits/` 页面保持原路径和原内容，不移动、转换、覆盖或重写。

关联 Change 的 Task Environment 只提供 OpenSpec、代码、提交和验证等事实来源；不得在任务验证工作区创建、复制或更新任务看板。一个完整任务关联多个 Change 或执行根时，仍只维护 retained Workspace checkout 中的同一文件。

## 4. 内容模型

- `changes` 可以为空；存在时只记录真实 id、核实状态、active/archive 稳定路径、摘要和 `batchIds`。
- `batches` 是可独立计划、实施和验收的交付组，使用稳定 id、状态、交付结果和 `changeIds`；code-only 或外部协作批次可以没有 change。
- `dependencyPool` 记录尚缺条件、进入条件和不受影响的批次。条件部分到位时拆出可执行批次，不让无关依赖阻塞其他工作；阶段只表示时间状态，不作为统一瀑布门禁。

首页先给出目标、当前结论、已完成、当前工作、下一步、阻塞和极简方案链路；推进页展示 change、批次、任务和依赖池，以可核实的 N/M 表达进度，不猜测百分比。方案页用 `businessPlan`、`technicalPlan`、decisions 和 boundaries 记录已确认方案；未确认内容标记待确认。技术细节 `technical.details` 只沉淀已完成且确有价值的复杂任务，不把预期实现写成事实，也不堆原始日志。

JSON 不包含 secret、token、cookie、个人敏感信息、完整思考过程或无关日志。

## 5. 更新与验证

首次创建，以及目标、范围、方案、批次、change、阻塞、用户判断、验证结论或任务状态实质变化时更新同一文件；用户询问进度时先核实再更新。没有改变任务认知的短暂检查不刷新。

写入前先生成候选并确认：

1. 路径、文件名与 `meta.taskId` 一致，`updatedAt` 是实际更新时间；
2. 内嵌 JSON 可解析，change/batch ids 唯一且双向关联一致；
3. 任务、批次、依赖、数量、链接和验证结论可由来源核实；
4. 页面无外部网络依赖和任务状态写回，桌面与窄屏布局、导航及首页默认焦点可用；
5. 方案与已完成技术事实分层，未确认内容没有伪装成进度。

候选与现有内容一致时返回 `aligned`，不制造无意义写入。候选通过检查后才能创建或替换目标；检查或写入失败时保留既有文件并返回 `blocked`。

## 6. 结果

`status: created | updated | aligned | blocked`：

- `created`：新文件真实写入成功。
- `updated`：既有文件发生实质更新。
- `aligned`：事实已核实且无需写入。
- `blocked`：Project、task identity、来源、授权、稳定路径或候选无法确认；保留现场并返回未决事项。

每次调用按 contract 返回 operation、status、Workspace/Project/task identity、绝对与相对路径、真实 change ids、changedAssets、sourceIdentities、updatedAt、unresolvedItems 和 nextActions。不得把文件存在、候选生成或单次 finding 冒充成功。

首次创建、实质更新、用户询问进度、任务暂停或完成时，回复提供“任务看板”的可点击入口、绝对路径、workspace 相对路径、关联 change 或 `none`、一句话状态和实际更新时间；未成功时说明原因和下一步，不声称已更新。
