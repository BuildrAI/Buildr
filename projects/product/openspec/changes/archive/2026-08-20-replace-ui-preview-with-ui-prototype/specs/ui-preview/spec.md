## REMOVED Requirements

### Requirement: UI Preview 必须由用户明确选择且不阻塞普通任务
**Reason**: UI Preview 已被非兼容地替换为 UI Prototype。

**Migration**: 使用 `ui-prototype` Skill 与 UI Prototype 工作流；旧 Skill 和产物不受支持。

#### Scenario: 旧触发规则被移除
- **WHEN** Agent 处理本 Change 后的 UI 相关任务
- **THEN** Agent MUST NOT 调用 `ui-preview`

### Requirement: UI Preview 必须先调查现有真实界面
**Reason**: 该行为已由新的 UI Prototype capability 取代。

**Migration**: 使用默认 `ui-prototype` Skill 的真实界面调查流程。

#### Scenario: 旧调查入口被移除
- **WHEN** Agent 需要生成界面原型
- **THEN** Agent MUST NOT 使用 `ui-preview` Skill 调查入口

### Requirement: UI Preview 必须交付完整、自包含且可发现的页面
**Reason**: 旧发现标记和预演产物已被非兼容替换。

**Migration**: 生成带 `<!-- buildr:ui-prototype -->` 标记的一个或多个自包含 HTML。

#### Scenario: 旧标记不再发现
- **WHEN** Change 中的 HTML 只包含 `buildr:ui-preview` 标记
- **THEN** Buildr MUST NOT 将其发现为 UI Prototype

### Requirement: UI Preview 必须经过浏览器验证并返回文件
**Reason**: 该行为已由新的 UI Prototype capability 取代。

**Migration**: 使用 `ui-prototype` Skill 验证并返回全部原型页面。

#### Scenario: 旧验证返回不再使用
- **WHEN** Agent 完成本 Change 后的原型验证
- **THEN** Agent MUST NOT 以 UI Preview 结果格式返回产物

### Requirement: UI Preview 必须保持非规范参考边界
**Reason**: 非规范边界与后续开发约束已重新定义为 UI Prototype 行为。

**Migration**: 依照 UI Prototype capability 的 authority 边界实施。

#### Scenario: 旧参考边界不再适用
- **WHEN** 当前 Task 已生成 UI Prototype 且用户未明确忽略
- **THEN** Agent MUST NOT 把它仅作为可自由放弃的 UI Preview 参考

### Requirement: 正式 Task 的 UI Preview 必须复用 Change 关联
**Reason**: Task-scoped 发现已切换到 UI Prototype 标记与命名。

**Migration**: 在关联 Change 内保存带新标记的原型 HTML；不迁移旧产物。

#### Scenario: 旧产物不迁移
- **WHEN** 关联 Change 只含旧 UI Preview 产物
- **THEN** Buildr MUST NOT 自动迁移或复制该产物
