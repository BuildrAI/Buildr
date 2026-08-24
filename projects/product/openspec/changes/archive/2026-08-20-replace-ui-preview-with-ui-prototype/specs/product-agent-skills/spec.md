## ADDED Requirements

### Requirement: Package 必须投射独立 UI Prototype Skill
Buildr package MUST 提供 id 为 `ui-prototype` 的 optional workspace Skill，并 MUST 将其作为普通 `skills/buildr/*` 资产同步和投射到支持的 Agent runtime。该 Skill MUST NOT 建立 capability contract 或 provider binding；用户在适用 scope 提供同名 Skill 时，MUST 沿用现有 Skill 重载与选择语义替换默认实现。

#### Scenario: Workspace 同步 UI Prototype Skill
- **WHEN** Buildr 将 package 资产同步到支持的 workspace runtime
- **THEN** `ui-prototype` MUST 作为 optional builtin Skill 可被发现
- **AND** 用户卸载或同名重载 optional Skill 时 MUST 遵守现有 builtin 投射与 Skill selection 语义

#### Scenario: 审查能力边界
- **WHEN** 维护者检查 `ui-prototype` 的 package manifest 与 Skill 正文
- **THEN** Skill MUST 不声明 `provides` 或 `requires` capability
- **AND** MUST 明确区别于正式设计、canonical specs 和真实前端工程中的编码式原型

### Requirement: UI 相关研发流程必须路由原型并默认遵循已有原型
Task Triage、Task Development 与 Buildr OpenSpec propose、update、apply contributions MUST 在当前任务可能改变前端 UI 时询问用户是否需要 UI Prototype，并 MUST 只在明确确认后路由到 selected `ui-prototype`。一旦 Task 已生成原型，后续正式前端实现 MUST 默认读取并按原型的信息架构、布局和交互开发，除非用户明确要求忽略。询问、产物与忽略选择 MUST NOT 成为 Planning Review、Development、Verification、Finish 或 Task 状态的 gate。

#### Scenario: OpenSpec 方案包含 UI 变化
- **WHEN** proposal、design 或 delta spec 表明本次 Change 会产生用户可见 UI 变化
- **THEN** Agent MUST 确认用户是否需要 UI Prototype
- **AND** 明确需要时 MUST 在正式实现前完成现有 UI 调查、一个或多个原型页面生成与浏览器验证

#### Scenario: 已有原型且用户未忽略
- **WHEN** 正式前端实现开始前已存在当前 Task 的 UI Prototype，且用户没有明确要求忽略
- **THEN** Agent MUST 读取全部相关原型并按其开发页面与交互
- **AND** 需要成为正式行为的确认选择 MUST 写入 design、delta specs、Brief 与 tasks

#### Scenario: 用户跳过生成或明确忽略已有原型
- **WHEN** 用户不需要生成原型、没有明确确认生成，或明确要求忽略已有原型
- **THEN** OpenSpec 与 Task Development MUST 继续当前合法阶段
- **AND** MUST NOT 创建占位文件、waiver、Result、Receipt 或 blocker

## REMOVED Requirements

### Requirement: Package 必须投射独立 UI Preview Skill
**Reason**: package 非兼容地以 `ui-prototype` 取代 `ui-preview`。

**Migration**: 使用新的 optional builtin `ui-prototype`；不提供旧 Skill 别名。

#### Scenario: 旧 Preview Skill 不再投射
- **WHEN** Buildr 同步本 Change 后的 package 资产
- **THEN** runtime MUST NOT 再把 `ui-preview` 作为 builtin Skill 投射

### Requirement: UI 相关研发流程必须执行非阻塞 Preview 询问
**Reason**: UI 相关工作流已改为原型询问，并增加已有原型默认约束开发的行为。

**Migration**: 路由 selected `ui-prototype`，并遵循新的生成、忽略与实施规则。

#### Scenario: 旧 Preview 询问不再路由
- **WHEN** UI 相关研发流程解析本 Change 后的工作流规则
- **THEN** Agent MUST NOT 再路由到 `ui-preview`
