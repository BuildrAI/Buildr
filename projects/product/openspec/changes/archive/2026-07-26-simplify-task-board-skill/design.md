## Context

`task-board` 是 optional builtin，也是 `buildr.task-board-maintenance/v1` 的默认 provider。当前 Skill 已覆盖稳定 task identity、可选 change 关联、交付批次、依赖池、普通用户优先和只读模板，但相同约束分散在 description、引言、内容组织、检查和 Result Evidence 中；package manifest 与 frontmatter 的 routing description 也不完全一致。

本次只收敛 Skill 及其发布元数据，并通过 delta spec 固化确定性操作语义。现有 capability contract、provider identity、consumer binding、模板 JSON schema 和历史页面迁移行为保持不变。

## Goals / Non-Goals

**Goals:**

- 让 description 只承担意图路由，并在发布 manifest 与 runtime frontmatter 中使用同一文本。
- 让正文按一次 create/update 的真实执行顺序组织，每项规则只表达一次。
- 明确既有看板的唯一匹配、identity 核验、候选验证、无变化和失败保留语义。
- 保留完整任务、批次、依赖池、真实 change、普通用户优先、离线只读和历史页面保护等现有能力。

**Non-Goals:**

- 不升级 `buildr.task-board-maintenance/v1`。
- 不改变 `board-data` schema、HTML 视觉设计或导航。
- 不增加 task-board CLI、数据库、服务或外部写回。
- 不迁移、转换或改写既有 `task-cockpits/` 页面。

## Decisions

### 1. 正文采用六段执行结构

正文固定为“适用范围 → 输入与事实 → 定位与操作 → 内容模型 → 更新与验证 → 结果”。相比保留现有按主题堆叠的章节，这种结构直接对应 Agent 的执行顺序，并允许删除独立的重复检查、用户回复和 Result Evidence 说明。

### 2. contract 管协作边界，Skill 管专业动作

保留 contract 的 operation、授权、状态和 result evidence 字段，Skill 只用紧凑清单说明调用时必须返回的结果，不复制 contract 的完整章节。模板继续负责具体展示字段，OpenSpec spec 继续负责产品承诺。

### 3. 精确匹配 task identity

既有文件候选必须满足 `yyyy-MM-dd-<task-id>.html` 的完整文件名结构，并且内嵌 `meta.taskId` 与请求一致。只能有一个有效候选；多个候选、identity 不一致或目标冲突均返回 `blocked`。这避免后缀 glob 把 `foo` 与 `my-foo` 混为同一任务。

### 4. 验证候选后再替换

Agent 先生成候选 HTML，核验 JSON、identity、关系、离线约束和只读行为，再写入目标。候选无语义变化返回 `aligned`；验证或写入失败时保留既有文件并返回 `blocked`。不规定具体文件 API，以兼容不同 Agent runtime，但要求结果可观察且不可假成功。

### 5. routing description 使用单一简洁文本

frontmatter、package builtin 和 workspace manifest 使用相同 description；`agents/openai.yaml` 继续保留更短的 UI 文案。旧称“任务驾驶舱”只在 routing description 和适用范围出现一次。

## Risks / Trade-offs

- [正文压缩遗漏低频约束] → 逐项对照现有 Skill、capability contract、canonical spec 和模板，建立静态测试覆盖关键短语与职责边界。
- [精确匹配规则使历史异常文件进入 blocked] → 返回冲突路径和 next actions，不猜测或覆盖；既有规范文件继续原地保留。
- [多个发布描述再次漂移] → 用现有 package baseline/fixture 测试断言三处 description 一致。
- [“验证后替换”在不同 Agent 工具中实现不同] → 只约束可观察前后条件，不引入特定工具依赖。
