## REMOVED Requirements

### Requirement: Buildr 提供任务资产沉淀审查 Skill
**Reason**: 过程型资产观察已由更窄的 terminal Task 执行效率复盘替代。
**Migration**: 使用 `task-retrospective`；不迁移 observation。

### Requirement: 沉淀审查使用可观察任务节点与最终证据
**Reason**: 新能力只在 terminal Task 后按需生成自由 Markdown 报告。
**Migration**: 由 `task-retrospectives` spec 定义可见证据边界。

### Requirement: Agent 使用结构化方法反思任务执行质量
**Reason**: 第一版不强制复盘分类或固定结构，避免限制 Agent 推理。
**Migration**: Skill 仅提供轻量效率关注点。

### Requirement: 沉淀候选必须通过质量和作用域检查
**Reason**: 第一版不生成资产候选。
**Migration**: 后续资产改进继续由用户发起独立 Task。

### Requirement: 候选只映射到 Rule 或 Skill
**Reason**: 第一版不生成或分类候选。
**Migration**: 无自动迁移。

### Requirement: 审查输出区分执行质量反馈和资产建议
**Reason**: 第一版只保存执行效率复盘报告。
**Migration**: 报告中的建议不自动成为资产写入授权。

### Requirement: 写入前必须取得用户确认
**Reason**: 已移除资产写回与 accept/reject 流程。
**Migration**: 任何后续产品或工作资产修改都必须进入独立正常任务流程。

### Requirement: 收尾报告保留可独立引用的候选证据
**Reason**: Task Retrospective 不属于 Task Finish，也不产生候选证据。
**Migration**: Local App 直接读取 SQLite current Result。

### Requirement: 确认后的写回使用现有生命周期
**Reason**: 新能力不执行资产写回。
**Migration**: 用户采纳优化建议时另建正式 Task。

### Requirement: 当前任务审查不依赖 Hook 或轨迹存储
**Reason**: 旧 requirement 随旧能力退役；等价安全边界已进入 `task-retrospectives`。
**Migration**: 新 Skill 同样禁止隐藏推理与完整轨迹依赖。

### Requirement: 资产审查核对源资产与实际产物
**Reason**: 新能力不承担资产维护审查。
**Migration**: 资产修改由对应 capability adaptation/Project workflow 负责。
