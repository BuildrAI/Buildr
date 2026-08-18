# ui-preview Specification

## Purpose

定义 UI Preview 的选择式触发、真实界面调查、完整页面 HTML 产物、浏览器验证、任务关联发现及使用边界。

## Requirements

### Requirement: UI Preview 必须由用户明确选择且不阻塞普通任务
当正式 Task、提案或研发动作可能产生前端 UI 变化时，Agent MUST 询问用户是否需要 UI Preview。只有用户明确确认需要后，Agent MUST 调用独立 `ui-preview` Skill；用户拒绝、未确认或选择继续原任务时 MUST NOT 生成预演稿，并 MUST 继续原任务的合法流程。

#### Scenario: 用户确认需要预演
- **WHEN** 任务可能改变前端 UI，且用户明确确认需要 UI Preview
- **THEN** Agent MUST 在正式前端实现前调用 `ui-preview` Skill
- **AND** MUST NOT 将确认推断为正式设计或像素级验收授权

#### Scenario: 用户不需要预演
- **WHEN** 用户拒绝 UI Preview、没有明确确认或直接要求继续任务
- **THEN** Agent MUST NOT 生成 UI Preview 文件
- **AND** 原任务 MUST NOT 因缺少 UI Preview 被阻塞

### Requirement: UI Preview 必须先调查现有真实界面
`ui-preview` Skill MUST 根据当前 Task、proposal、design、delta specs 与相关 current knowledge 确定范围，并 MUST 读取或运行任务涉及的真实前端，调查相关页面、路由、组件、样式、布局和交互习惯。无法访问现有界面或无法可靠判断当前 UI 时，Skill MUST 在生成前明确报告，且 MUST NOT 假称结果基于现有产品。

#### Scenario: 可以访问现有界面
- **WHEN** Agent 能读取并在需要时运行目标前端页面
- **THEN** 预演稿 MUST 延续已有信息架构、页面框架、视觉语言与交互习惯
- **AND** 调查过程 MUST NOT 作为面向用户的预演页面内容

#### Scenario: 无法可靠判断当前 UI
- **WHEN** 目标页面、运行环境或必要界面事实不可访问
- **THEN** Skill MUST 报告缺失事实与影响
- **AND** MUST 在恢复可靠依据前停止生成预演稿

### Requirement: UI Preview 必须交付完整、自包含且可发现的页面
每个 UI Preview 页面 MUST 是可直接打开的自包含 HTML，使用内联或 data/blob 资源表达必要 CSS、JavaScript、图像、字体与媒体，并 MUST 包含 `<!-- buildr:ui-preview -->` 发现标记和用户可读 `<title>`。即使需求只修改一个模块，页面也 MUST 在现有导航、页面框架和相关模块组成的完整页面上下文中呈现变化后的结果。

#### Scenario: 只修改页面局部模块
- **WHEN** 提案只改变任务首页中的一个信息模块
- **THEN** 预演稿 MUST 同时呈现现有导航、页面框架、相关模块与修改后的目标模块
- **AND** MUST NOT 只交付孤立组件

#### Scenario: 一个任务需要多个页面或状态
- **WHEN** 核心流程需要多个页面或关键状态才能被理解
- **THEN** Skill MUST 可以按实际任务生成一个或多个带发现标记的 HTML 文件
- **AND** MUST NOT 要求固定文件数量或固定目录

### Requirement: UI Preview 必须经过浏览器验证并返回文件
Skill MUST 在浏览器中打开生成的 HTML，验证页面能够展示、核心交互能够操作且必要关键状态可达，并 MUST 返回实际文件与已验证范围。任何无法验证的交互或状态 MUST 明确列为边界。

#### Scenario: 预演页面验证成功
- **WHEN** 页面和核心交互在浏览器中正常工作
- **THEN** Skill MUST 返回全部预演文件及验证摘要
- **AND** 后续设计师或 Agent MUST 能直接打开完整 HTML 作为参考

#### Scenario: 浏览器验证不完整
- **WHEN** 浏览器能力、页面脚本或环境限制使部分核心交互无法验证
- **THEN** Skill MUST 报告未验证范围
- **AND** MUST NOT 将文件描述为已完整验证

### Requirement: UI Preview 必须保持非规范参考边界
UI Preview MUST 只用于在正式开发前对齐完整页面预期，并 MAY 作为设计与后续前端开发的视觉和交互参考；它 MUST NOT 成为正式设计稿、生产原型、Planning Identity、canonical spec、Task Verification Result 或默认像素级验收标准。

#### Scenario: 后续没有设计师参与
- **WHEN** Agent 根据已确认 UI Preview 开始正式前端开发
- **THEN** Agent MAY 加载完整预演文件作为参考
- **AND** 正式行为与验收 MUST 继续以 specs、design、项目实现和正式验证事实为准

### Requirement: 正式 Task 的 UI Preview 必须复用 Change 关联
当正式 Task 具有一个或多个关联 OpenSpec Change 时，UI Preview 文件 MUST 可以放在相应 Change 内的任意目录，并由 Buildr 通过 Task-scoped Change working copy 发现带标记的普通 HTML 文件。Buildr MUST NOT 为此新增 Task Record 字段、数据库状态、固定预演目录或 UI Preview CLI。

#### Scenario: Change 从 active 进入 archive
- **WHEN** Task 关联 Change 的工作副本从 active 收敛为 archived
- **THEN** Buildr MUST 继续从同一 Task-scoped Change read model 发现归档目录中的预演文件
- **AND** MUST NOT 要求迁移到第二预演存储

#### Scenario: Task 没有关联 Change
- **WHEN** Task 没有关联 OpenSpec Change
- **THEN** Buildr Web MUST 返回明确无可发现预演稿的空态
- **AND** MUST NOT 扫描整个 Workspace 或创建隐式关联
