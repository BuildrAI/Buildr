---
name: task-board
description: 为复杂、长期、跨批次、跨 change、跨服务或团队，或存在交叉依赖和多次用户判断的任务创建、更新和检查只读 HTML 任务看板；看板以稳定 task identity 为主，可关联零个或多个真实 changes。用户要求任务可视化、整体进度、任务全景、长期跟踪或沿用旧称“任务驾驶舱”时也使用。
---

# Task Board Skill

本 Skill 是 `buildr.task-board-maintenance/v1` 的默认 provider，由 Agent 单向维护整个任务面向用户的可视化任务看板。任务看板不是 OpenSpec change 的翻译，也不替代 specs、代码、验证或外部系统事实。“任务驾驶舱”只作为旧用户意图继续路由到本 Skill，不再作为当前产品名称或 artifact 身份。

## 判断创建还是维护

满足任一条件时创建或继续维护任务看板：

- 用户明确要求任务可视化、任务看板、整体进度、任务全景、长期跟踪，或使用旧称“任务驾驶舱”。
- 任务跨多个批次、change、服务、代码仓或团队。
- 任务存在外部依赖、交叉依赖、等待事项或无法一次完成的后续阶段。
- 任务预计跨会话持续推进，或需要多次用户判断。
- 单个 `tasks.md`、当前 change 或对话无法表达完整任务生命周期。

简单、短时、无持续跟踪价值的任务继续用简洁对话汇报，不为形式完整创建空洞页面。

## 解析任务与位置

1. 从 Buildr workspace root、Project registry 和任务实际范围解析拥有任务的 Project，不根据当前目录猜测。
2. 使用稳定、简短的 kebab-case `task-id` 作为看板主 identity。OpenSpec changes 是 `0..N` 个可选真实关联；尚无 change 时保持空集合，不用未来名称冒充真实关联，也不为创建看板强制进入 change-flow。
3. 查找 `projects/<project>/openspec/knowledge/task-boards/*-<task-id>.html`；存在时继续更新，不按更新时间创建新文件。
4. 首次创建时使用 Project 所在环境的本地日期，路径固定为：

   ```text
   projects/<project>/openspec/knowledge/task-boards/yyyy-MM-dd-<task-id>.html
   ```

5. 以当前 runtime `SKILL.md` 所在目录为基准，从相对路径 `assets/task-board-template.html` 复制模板到目标位置，替换内嵌 `#board-data` JSON。完整目录投射是 Buildr runtime contract；不要绕回 workspace 源目录、依赖 `agents/openai.yaml` 定位资源或重新手写模板。保持单文件，不引用 CDN、远端脚本、远端字体或远端图片。

既有 `task-cockpits/` 页面保持原路径和原内容。产品升级、workspace 初始化或同步、Skill 替换和 runtime 投射都不得移动、转换、覆盖或重写这些历史 HTML；新任务只在 `task-boards/` 下创建页面。

## 核实任务事实

按任务相关性读取，不做无关全量审计：

- 用户已经确认的目标、边界和判断。
- 存在关联时，当前及历史 OpenSpec proposal、design、specs、tasks 和 CLI status。
- 相关代码、提交、测试和验证结果。
- 外部团队、接口、审批、发布或联调依赖。
- 既有看板中的历史批次、change 关联与稳定任务身份。

权威来源冲突时先修正看板，不用看板覆盖权威事实。改变 requirement、状态流、API、权限或数据语义的决策先按 `task-triage` 维护 OpenSpec；普通进度、批次关系、外部等待和验证结果可直接维护看板。

## 任务、批次、change 与依赖池

- 看板的范围是用户确认的完整任务或迭代，不是当前 active change，也不因一个 change 完成或归档而结束。
- `changes` 可以为空；存在关联时，每项记录真实 change id、核实状态、active 或 archive 稳定路径、摘要和关联 `batchIds`，更新时重新核实状态和路径。
- 批次是可以独立形成方案、实施和验收的一组任务。每个 `batches` 项使用稳定 id，记录交付结果、状态和 `changeIds`；没有真实 change 的 code-only 或外部协作批次使用空数组，并通过任务、代码或验证 evidence 表达进度。
- 阶段只表达随时间推进的状态，不得成为所有任务必须串行通过的瀑布门禁。
- 没有依赖或依赖已经到位的任务形成可执行批次，不得被其他尚未澄清的依赖拖住。
- 尚不具备实施条件的任务进入 `dependencyPool`，写明缺失能力、进入条件和不受影响的批次。
- 依赖部分到位时，把已具备条件的任务拆成新批次；只有改变业务语义时才按 task triage 形成新 change，其余任务继续留池。

## 组织内容

### 首页

首页必须让普通用户一眼看懂：

- 我们在做什么。
- 当前结论和批次。
- 已完成、正在做、下一步。
- 当前阻塞或需要用户关注什么。
- 整体方案的极简链路。

首页先写结论再写原因。每张卡片保持短小；不要以 API、类名、数据库字段、大表格或代码作为首页主体。

### 推进

按整个任务而不是单个 change 展示：

- 已关联 change 的 id、状态、路径及其与批次的关系；没有关联时明确显示 `none`。
- 已形成批次及其完成、进行中或待开始状态。
- 批次内的关键任务、code-only 工作或外部协作交付。
- 尚未满足条件的依赖池、进入条件和不受影响的批次。
- 可核实的“批次 N/M”“任务 N/M”或依赖池规模，不猜测百分比。

已完成批次保留交付和验证摘要，默认减少细节；当前批次和依赖项高亮。不得把 change 生命周期冒充完整任务生命周期。

### 方案

方案描述完整任务中相关模块的业务方案和技术方案，不描述看板自身如何管理任务：

- `businessPlan` 按业务模块说明目标流程、角色职责、资金或数据流向、业务状态和例外边界。
- `technicalPlan` 说明开发前已确认的系统交互、接口契约、状态处理、实现边界、验证和回滚。
- 关键选择记录影响整体方案的决定和理由；范围与边界区分本任务处理和明确不处理的内容。

使用普通语言和简短流程或对照卡，不机械复制 `design.md`。未确认内容明确标注待确认。

### 技术细节

`technical.details` 只关联已经完成、确有技术含量或沉淀价值的复杂任务：

- 按任务选择性记录关键设计、API 或状态映射、数据结构、关键文件、简略代码、验证结果和注意事项。
- 未完成任务的预期实现属于技术方案，不提前伪装成已经落地的技术事实。
- 普通任务不强制填写；不堆原始命令流水、完整日志或无关文件清单。

## 更新节点

在以下节点核实事实并更新同一文件：

- 首次创建。
- 目标、范围或整体方案变化。
- 任务批次变化、change 状态变化或完成一个任务组。
- 出现、变化或解除阻塞。
- 用户完成关键判断。
- 用户询问进度。
- 验证结果改变结论。
- 任务暂停、恢复或完成。

没有改变任务认知的短暂命令或检查不机械刷新。

## 页面维护约束

- 用户只通过 Agent 对话参与；checkbox、状态 chip、进度条和按钮只读，不回写任务事实。
- 只修改模板内嵌 `script#board-data` 的 JSON 和确有必要的任务专属文案；保持模板结构、响应式样式和导航行为稳定。
- JSON 中不放 secret、token、cookie、个人敏感信息、完整思考过程或无关原始日志。
- `updatedAt` 使用实际更新时间；状态未核实时明确写“待核实”，不伪造进度。
- 任务完成后保留稳定入口、历史批次和 change 关联，不因 change archive 移动看板。

## 检查

创建或实质更新后：

1. 确认文件名匹配 `yyyy-MM-dd-<task-id>.html`，且位于正确 Project 的 `openspec/knowledge/task-boards/`。
2. 检查内嵌 JSON 可解析，页面没有外部网络依赖。
3. 用本地浏览器检查桌面和窄屏布局；确认默认首页聚焦，导航可用，技术内容后置。
4. 确认 `changes` 是数组；存在 change 时状态和路径真实、双向 `batchIds` / `changeIds` 一致，不存在时 batch `changeIds` 为空且没有 planned identity。
5. 对照权威来源检查完整任务、批次、依赖池、任务数量、验证结论和链接；可执行工作没有被无关依赖阻塞。
6. 确认“方案”是任务业务与技术方案；“技术细节”只记录已完成复杂任务，不把预期写成事实。
7. 确认 HTML 只读，没有修改任务状态的事件处理或外部写回。

## 面向用户的回复

驾驶舱首次创建、实质更新、用户询问进度、任务暂停或完成时，回复提供可点击入口并包含：

```text
任务看板：查看 <任务名称>（使用任务看板绝对路径作为 Markdown 链接目标）
位置：<workspace-relative-path>
关联 change：<change-id>[, ...] / none
当前状态：<一句话状态>
任务看板已更新：<实际时间>
```

当前 runtime 不支持本地 Markdown 链接时仍提供准确绝对路径和 workspace 相对路径。未成功更新时不得声称已更新，改为说明原因和下一步。

## Result Evidence

每次 create/update 返回：

```text
operation: create | update
status: created | updated | aligned | blocked
workspace: <identity>
project: <identity/code>
task: <task-id>
path: <absolute path>
relativePath: <workspace-relative path>
changeIds: <ids or none>
changedAssets: <path or none>
sourceIdentities: <facts/evidence>
updatedAt: <actual time>
unresolvedItems: <items or none>
nextActions: <actions or none>
```

Project、task identity、事实来源、授权或稳定路径无法确认，既有页面冲突，或候选内容会覆盖权威事实时返回 `blocked` 并保留现场。只有真实写入成功才能返回 `created|updated`。
