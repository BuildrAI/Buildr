# ui-prototype Specification

## Purpose

定义默认界面原型 Skill 的触发、真实界面调查、单页或多页自包含 HTML、浏览器验证、可重载边界，以及已有原型默认约束后续开发的规则。

## Requirements

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

### Requirement: 默认 UI Prototype 必须先调查现有真实界面
默认 `ui-prototype` Skill MUST 根据用户当前讨论、已知目标和已有的 Task、proposal、design、delta specs 与相关 current knowledge 确定范围，MUST NOT 因尚无正式 Task 或 Change 阻止已授权的原型探索，并 MUST 读取或运行任务涉及的真实前端，调查相关页面、路由、组件、样式、布局和交互习惯。无法访问现有界面或无法可靠判断当前 UI 时，Skill MUST 在生成前明确报告，且 MUST NOT 假称结果基于现有产品。

#### Scenario: 可以访问现有界面
- **WHEN** Agent 能读取并在需要时运行目标前端页面
- **THEN** 原型 MUST 延续已有信息架构、页面框架、视觉语言与交互习惯
- **AND** 调查过程 MUST NOT 作为面向用户的原型页面内容

#### Scenario: 无法可靠判断当前 UI
- **WHEN** 目标页面、运行环境或必要界面事实不可访问
- **THEN** Skill MUST 报告缺失事实与影响
- **AND** MUST 在恢复可靠依据前停止生成原型

### Requirement: 默认 UI Prototype 必须交付一个或多个完整自包含页面
默认 `ui-prototype` 技能（Skill）MUST 按任务范围选择关键页面与必要状态，默认不为每个小改动单独制页；MUST 优先复用相关真实组件（Component）和主题源码，使用模拟数据（Mock Data）及本地操作生成一个或多个可直接打开的自包含 HTML 页面。允许在隔离位置创建候选源码和独立预览构建，MUST 不把此授权推导为正式上线、真实写入或部署授权。每个页面 MUST 包含 `<!-- buildr:ui-prototype -->` 发现标记和用户可读 `<title>`，并 MUST 以内联或 data/blob 资源表达必要 CSS、JavaScript、图像、字体与媒体。即使需求只修改一个模块，页面也 MUST 在现有导航、页面框架和相关模块组成的完整页面上下文中呈现变化后的结果。

#### Scenario: 单页足以表达核心流程
- **WHEN** 一个完整页面及其本地状态切换足以表达本次 UI 变化
- **THEN** Skill MUST 生成至少一个完整原型页面
- **AND** MUST NOT 只交付孤立组件或截图

#### Scenario: 核心流程需要多个页面
- **WHEN** 核心流程跨越两个或以上页面，无法由单个页面的状态切换可靠表达
- **THEN** Skill MUST 生成多个分别带发现标记和标题的自包含 HTML 页面
- **AND** 每个页面 MUST 使用模拟数据且不得连接真实后端或执行真实写入

#### Scenario: 局部小改动
- **WHEN** 本次仅在关键页面内调整局部内容且用户未要求逐项制页
- **THEN** 技能（Skill）MUST 在相关完整页面与说明中体现变化，MUST NOT 为每处小改动重复生成页面

#### Scenario: 复用存在限制
- **WHEN** 相关源码不可可靠访问或真实副作用无法隔离
- **THEN** 技能（Skill）MUST 说明受影响范围，MUST NOT 用手写近似冒充同源复用或连接真实接口（API）补足演示

### Requirement: UI Prototype 必须经过浏览器验证并返回全部文件
技能（Skill）MUST 在浏览器中打开生成的每个 HTML 文件，并检查展示、核心交互、必要状态、当前说明和既有交互的一致性；尚无关联 Change 时 MUST 验证独立预览并说明任务内展示不适用，归入关联 Change 后 MUST 验证实际任务阅读与单独查看；MUST 返回全部实际文件、来源观察及逐页验证范围。任何无法验证的交互或状态 MUST 明确列为边界。

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
UI Prototype MUST 只用于对齐完整页面与约束后续实现，MUST NOT 成为正式设计稿、canonical spec、Planning Identity、Task Verification Result 或默认像素级验收标准。需要在正式 Task 中展示且已有关联变更的原型 MUST 作为关联 OpenSpec Change 内的普通 HTML 被 Task-scoped read model 发现；Buildr MUST NOT 新增 Task Record 字段、数据库状态、固定原型目录、独立存储或 UI Prototype CLI。

#### Scenario: Change 从 active 进入 archive
- **WHEN** Task 关联 Change 的工作副本从 active 收敛为 archived
- **THEN** Buildr MUST 继续从同一 Task-scoped Change read model 发现归档目录中的原型文件
- **AND** MUST NOT 要求迁移到第二原型存储

#### Scenario: Task 没有关联 Change
- **WHEN** Task 没有关联 OpenSpec Change
- **THEN** Buildr Web MUST 返回明确无可发现原型的空态
- **AND** MUST NOT 扫描整个 Workspace 或创建隐式关联

### Requirement: 关键页面说明与源码来源可以独立接续
新生成的原型 MUST 提供关键页面、必要状态、本次变化、主要功能、操作结果及边界的对应说明，并保持当前画面和说明一致。原型 MUST 记录可追溯的源码观察与已验证范围；自包含成果 MUST 能在离线安全隔离中独立展示，MUST NOT 依赖开发服务器、真实网络、父页面权限或浏览器持久存储。

#### Scenario: 说明随页面变化
- **WHEN** 用户从目录或原型交互进入另一已制作的关键页面或状态
- **THEN** 对应说明 MUST 与当前画面一致，重看指定画面 MUST 使用明确初始数据

#### Scenario: 交给后续智能体
- **WHEN** 后续智能体（Agent）读取本次演示成果
- **THEN** MUST 能确定覆盖的关键页面、来源观察、模拟边界和未验证项；成果 MUST 不替代正式行为规范

### Requirement: 原型成果必须随实施决定可靠接续
原型技能（Skill）MUST 负责临时保存、归入任务及清理；入口技能 MUST 在用户决定实施且已有原型时接续该职责，MUST NOT 将接续已有成果当作生成新原型而重复索取授权。未决定实施且未指定持久位置时 MUST 使用实际系统临时目录内独立子目录保存预览，不强制造 Task 或 Change。决定实施后 MUST 在正式前端编辑前核对并保全已确认版本，有关联变更时 MUST 放入其真实工作副本内并验证任务展示、更新引用；MUST NOT 以新生成内容冒充已确认版本。

#### Scenario: 先看原型再决定
- **WHEN** 用户明确要求看原型，尚未决定实施且没有变更
- **THEN** 智能体（Agent）MUST 可直接生成临时预览，报告实际路径及临时保留性质，不要求先创建变更

#### Scenario: 决定按已有原型实施
- **WHEN** 用户决定实施且已有讨论阶段原型及关联变更
- **THEN** 智能体（Agent）MUST 核对确认版本、复制到关联变更、验证内容保全与实际任务阅读及单独查看、更新引用，再接续正式前端编辑
- **AND** MUST 在正式副本可读前保留临时原件，不把迁移推迟至收尾

#### Scenario: 不需要变更的实施
- **WHEN** 用户决定实施但按实际语义不需要变更
- **THEN** 智能体（Agent）MUST 按项目约定保全原型并提供可读引用，说明当前任务内原型展示不支持，MUST NOT 为展示而强造变更

#### Scenario: 临时文件已丢失
- **WHEN** 接续时发现临时文件已被清除
- **THEN** 智能体（Agent）MUST 报告缺失并核对可恢复来源，重建内容不得冒充原确认版，不阻止无关安全工作

### Requirement: 原型清理必须保护已确认成果与未知归属内容
用户明确放弃或授权清理时，原型技能（Skill）MUST 仅清理归属明确且无需保留的临时成果；沉默 MUST NOT 被视为放弃。归入任务后的清理 MUST 先核对正式副本已保全，MUST NOT 删除共享源码、未知归属内容或其他任务资产；工作树（Worktree）清理 MUST 交还原提供者。

#### Scenario: 明确放弃探索
- **WHEN** 用户明确放弃该任务且没有保留要求
- **THEN** 智能体（Agent）MUST 可以清理本次临时预览，保留共享或未知归属内容，不制造正式完成事实

#### Scenario: 尚未答复
- **WHEN** 用户尚未继续讨论或确认实施
- **THEN** 智能体（Agent）MUST NOT 主动以放弃为由清理，也不得承诺系统永久保留临时目录
