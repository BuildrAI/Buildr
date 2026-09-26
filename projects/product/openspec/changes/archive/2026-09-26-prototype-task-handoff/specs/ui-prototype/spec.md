## MODIFIED Requirements

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

## ADDED Requirements

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
