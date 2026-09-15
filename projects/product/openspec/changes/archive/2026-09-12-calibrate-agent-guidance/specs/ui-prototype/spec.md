## MODIFIED Requirements

### Requirement: UI Prototype 必须由用户明确选择生成且不阻塞普通任务
当正式 Task、提案或研发动作涉及新页面、主要布局或交互且存在实质设计选择，用户尚未表达原型偏好时，Agent MUST 询问用户是否需要 UI Prototype；已明确设计的局部修复 MUST 直接推进，不机械询问。只有用户明确确认需要后，Agent MUST 调用 selected `ui-prototype` Skill；用户拒绝、未确认或选择继续原任务时 MUST NOT 生成原型，并 MUST 继续原任务的合法流程。

#### Scenario: 用户确认需要原型
- **WHEN** 任务可能改变前端 UI，且用户明确确认需要 UI Prototype
- **THEN** Agent MUST 在正式前端实现前调用 selected `ui-prototype` Skill
- **AND** MUST NOT 将确认推断为正式设计或像素级验收授权

#### Scenario: 用户不需要原型
- **WHEN** 用户拒绝 UI Prototype、没有明确确认或直接要求继续任务
- **THEN** Agent MUST NOT 生成 UI Prototype 文件
- **AND** 原任务 MUST NOT 因缺少 UI Prototype 被阻塞

#### Scenario: 已明确设计的局部界面修复
- **WHEN** 任务只按已确认设计修正文案、样式或局部交互，没有实质设计选择
- **THEN** Agent MUST 直接推进修改，不额外询问是否生成原型
- **AND** 用户主动要求原型时 MUST 保持明确选择入口可用
