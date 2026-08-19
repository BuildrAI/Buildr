## ADDED Requirements

### Requirement: Package 必须投射独立 UI Preview Skill
Buildr package MUST 提供 id 为 `ui-preview` 的 optional workspace Skill，并 MUST 将其作为普通 `skills/buildr/*` 资产同步和投射到支持的 Agent runtime。第一版 MUST NOT 为该 Skill 建立 capability contract、provider binding 或与编码式原型合并的入口。

#### Scenario: Workspace 同步 UI Preview Skill
- **WHEN** Buildr 将 package 资产同步到支持的 workspace runtime
- **THEN** `ui-preview` MUST 作为 optional builtin Skill 可被发现
- **AND** 用户卸载 optional Skill 时 MUST 遵守现有 builtin 卸载与投射语义

#### Scenario: 审查能力边界
- **WHEN** 维护者检查 `ui-preview` 的 package manifest 与 Skill 正文
- **THEN** Skill MUST 不声明 `provides` 或 `requires` capability
- **AND** MUST 明确区别于正式设计、视觉重构和真实前端工程中的编码式原型

### Requirement: UI 相关研发流程必须执行非阻塞 Preview 询问
Task Triage、Task Development 与 Buildr OpenSpec propose、update、apply contributions MUST 在当前任务可能改变前端 UI 时询问用户是否需要 UI Preview，并 MUST 只在明确确认后路由到 `ui-preview`。询问与产物 MUST NOT 成为 Planning Review、Development、Verification、Finish 或 Task 状态的 gate。

#### Scenario: OpenSpec 方案包含 UI 变化
- **WHEN** proposal、design 或 delta spec 表明本次 Change 会产生用户可见 UI 变化
- **THEN** Agent MUST 确认用户是否需要 UI Preview
- **AND** 明确需要时 MUST 在正式实现前完成现有 UI 调查、预演生成与浏览器验证

#### Scenario: 用户跳过 UI Preview
- **WHEN** 用户不需要预演或没有明确确认
- **THEN** OpenSpec 与 Task Development MUST 继续当前合法阶段
- **AND** MUST NOT 创建占位文件、waiver、Result、Receipt 或 blocker
