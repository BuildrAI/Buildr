## REMOVED Requirements

### Requirement: Buildr 提供任务看板 Skill
**Reason**: 没有真实不可替代 consumer，且静态页面会复制 Task 与专业 current facts。
**Migration**: 使用普通 Task、Parent/Child、Local App 与公开 read models；保留既有历史 HTML 原文。

### Requirement: 任务看板 Skill 必须简洁且职责分层
**Reason**: `task-board` Skill 整体退役。
**Migration**: 删除 Skill、runtime 投射和 capability metadata。

### Requirement: 任务看板候选必须先验证再替换
**Reason**: 产品不再生成或更新任务看板候选。
**Migration**: 历史页面不再被当前 writer 接管。

### Requirement: 任务看板使用稳定的 Project knowledge 路径
**Reason**: `task-boards/` 不再是可写 current task knowledge 路径。
**Migration**: 既有文件原路径原内容保留；不创建新文件。

### Requirement: 任务看板由 Agent 单向维护
**Reason**: Agent 不再维护第二份静态任务事实。
**Migration**: Agent 只调用 Task 与各专业 Application/read model，并通过对话汇报。

### Requirement: 任务看板优先服务普通用户理解
**Reason**: 静态 Board UI 退役。
**Migration**: 普通用户通过 Local App 当前视图和对话理解任务。

### Requirement: 任务看板聚焦重要且易懂的信息
**Reason**: Board-owned 展示模型退役。
**Migration**: 当前状态由各权威 read model 动态表达。

### Requirement: 任务看板保持事实来源边界
**Reason**: 即使声明来源边界，静态摘要仍形成易陈旧的第二份事实。
**Migration**: 直接消费 canonical specs、Task 与专业 read model。

### Requirement: Agent 在关键回复中提供任务看板入口
**Reason**: 当前产品不再提供 Task Board 入口。
**Migration**: 回复引用 Task、Parent、Change、Review、Verification 或 Local App 当前入口。

### Requirement: 任务看板模板自包含且可移植
**Reason**: 静态 HTML template 随 Board writer 一并退役。
**Migration**: 删除 package template；不改写历史 HTML。

### Requirement: 任务看板关联真实 OpenSpec change
**Reason**: Task 与 Change 的关联无需通过 Board 复制。
**Migration**: 使用 Task Record 的 changes 与 OpenSpec current state。

### Requirement: 任务看板按交付批次和依赖池组织进度
**Reason**: `batches`、`dependencyPool` 与 Board-owned progress 没有独立 authority 或 consumer。
**Migration**: 不把这些结构塞入 Task Record；用 Parent/Child 表达当前已验证的最小协调关系。

### Requirement: 任务看板区分方案与已完成技术事实
**Reason**: Planning、Development、Review 与 Verification 已有各自 authority。
**Migration**: 使用对应专业 current records 与 OpenSpec artifacts，不保留 Board 副本。
