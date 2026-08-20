## ADDED Requirements

### Requirement: UI Prototype 必须由用户明确选择生成且不阻塞普通任务
当正式 Task、提案或研发动作可能产生前端 UI 变化时，Agent MUST 询问用户是否需要 UI Prototype。只有用户明确确认需要后，Agent MUST 调用 selected `ui-prototype` Skill；用户拒绝、未确认或选择继续原任务时 MUST NOT 生成原型，并 MUST 继续原任务的合法流程。

#### Scenario: 用户确认需要原型
- **WHEN** 任务可能改变前端 UI，且用户明确确认需要 UI Prototype
- **THEN** Agent MUST 在正式前端实现前调用 selected `ui-prototype` Skill
- **AND** MUST NOT 将确认推断为正式设计或像素级验收授权

#### Scenario: 用户不需要原型
- **WHEN** 用户拒绝 UI Prototype、没有明确确认或直接要求继续任务
- **THEN** Agent MUST NOT 生成 UI Prototype 文件
- **AND** 原任务 MUST NOT 因缺少 UI Prototype 被阻塞

### Requirement: 默认 UI Prototype 必须先调查现有真实界面
默认 `ui-prototype` Skill MUST 根据当前 Task、proposal、design、delta specs 与相关 current knowledge 确定范围，并 MUST 读取或运行任务涉及的真实前端，调查相关页面、路由、组件、样式、布局和交互习惯。无法访问现有界面或无法可靠判断当前 UI 时，Skill MUST 在生成前明确报告，且 MUST NOT 假称结果基于现有产品。

#### Scenario: 可以访问现有界面
- **WHEN** Agent 能读取并在需要时运行目标前端页面
- **THEN** 原型 MUST 延续已有信息架构、页面框架、视觉语言与交互习惯
- **AND** 调查过程 MUST NOT 作为面向用户的原型页面内容

#### Scenario: 无法可靠判断当前 UI
- **WHEN** 目标页面、运行环境或必要界面事实不可访问
- **THEN** Skill MUST 报告缺失事实与影响
- **AND** MUST 在恢复可靠依据前停止生成原型

### Requirement: 默认 UI Prototype 必须交付一个或多个完整自包含页面
默认 `ui-prototype` Skill MUST 使用静态模拟数据和本地 JavaScript 交互生成一个或多个可直接打开的自包含 HTML 页面。每个页面 MUST 包含 `<!-- buildr:ui-prototype -->` 发现标记和用户可读 `<title>`，并 MUST 以内联或 data/blob 资源表达必要 CSS、JavaScript、图像、字体与媒体。即使需求只修改一个模块，页面也 MUST 在现有导航、页面框架和相关模块组成的完整页面上下文中呈现变化后的结果。

#### Scenario: 单页足以表达核心流程
- **WHEN** 一个完整页面及其本地状态切换足以表达本次 UI 变化
- **THEN** Skill MUST 生成至少一个完整原型页面
- **AND** MUST NOT 只交付孤立组件或截图

#### Scenario: 核心流程需要多个页面
- **WHEN** 核心流程跨越两个或以上页面，无法由单个页面的状态切换可靠表达
- **THEN** Skill MUST 生成多个分别带发现标记和标题的自包含 HTML 页面
- **AND** 每个页面 MUST 使用模拟数据且不得连接真实后端或执行真实写入

### Requirement: UI Prototype 必须经过浏览器验证并返回全部文件
Skill MUST 在浏览器中打开生成的每个 HTML 文件，验证页面能够展示、核心交互能够操作且必要关键状态可达，并 MUST 返回全部实际文件与逐页验证范围。任何无法验证的交互或状态 MUST 明确列为边界。

#### Scenario: 多个原型页面验证成功
- **WHEN** 多个原型页面及其核心交互在浏览器中正常工作
- **THEN** Skill MUST 返回全部原型文件及逐页验证摘要
- **AND** 后续设计师或 Agent MUST 能直接打开每个完整 HTML

#### Scenario: 浏览器验证不完整
- **WHEN** 浏览器能力、页面脚本或环境限制使部分页面或核心交互无法验证
- **THEN** Skill MUST 报告未验证范围
- **AND** MUST NOT 将全部文件描述为已完整验证

### Requirement: 已有 UI Prototype 默认约束后续前端开发
当当前 Task 已生成一个或多个 UI Prototype，且用户没有明确要求忽略原型时，后续 Agent MUST 在正式前端编辑前读取全部相关原型，并 MUST 按其已确认的信息架构、页面布局和交互方式实施。需要成为正式行为或验收条件的选择 MUST 同步进入 design、delta specs、Brief 和 tasks；原型 MUST NOT 取代这些 authority。

#### Scenario: 用户未忽略已有原型
- **WHEN** Task 关联 Change 中存在可发现 UI Prototype，且用户没有明确要求忽略
- **THEN** Agent MUST 在实现前读取相关原型页面并据此开发页面与交互
- **AND** MUST 将需要成为正式行为的确认选择写入对应 planning artifacts

#### Scenario: 用户明确忽略原型
- **WHEN** 用户在当前任务中明确要求忽略已有 UI Prototype
- **THEN** Agent MUST 可以不以原型作为实施输入并继续合法开发流程
- **AND** Buildr MUST NOT 为该选择新增 Task 字段、waiver、Result、Receipt 或 blocker

#### Scenario: 原型与正式 authority 冲突
- **WHEN** UI Prototype 与 current design、delta specs 或其他 canonical behavior 冲突
- **THEN** Agent MUST 以正式 authority 为准并明确报告差异
- **AND** MUST NOT 让原型 HTML 静默覆盖规范行为

### Requirement: UI Prototype 必须保持非规范且复用 Task Change 关联
UI Prototype MUST 只用于对齐完整页面与约束后续实现，MUST NOT 成为正式设计稿、canonical spec、Planning Identity、Task Verification Result 或默认像素级验收标准。正式 Task 的原型 MUST 作为关联 OpenSpec Change 内的普通 HTML 被 Task-scoped read model 发现；Buildr MUST NOT 新增 Task Record 字段、数据库状态、固定原型目录、独立存储或 UI Prototype CLI。

#### Scenario: Change 从 active 进入 archive
- **WHEN** Task 关联 Change 的工作副本从 active 收敛为 archived
- **THEN** Buildr MUST 继续从同一 Task-scoped Change read model 发现归档目录中的原型文件
- **AND** MUST NOT 要求迁移到第二原型存储

#### Scenario: Task 没有关联 Change
- **WHEN** Task 没有关联 OpenSpec Change
- **THEN** Buildr Web MUST 返回明确无可发现原型的空态
- **AND** MUST NOT 扫描整个 Workspace 或创建隐式关联
