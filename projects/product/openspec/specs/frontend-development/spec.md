# frontend-development Specification

## Purpose
定义前端开发技能（Frontend Development Skill）的适用范围与工作保证，引导智能体（Agent）基于项目已有样式和交互组织可复用源码，使正式页面与演示页面保持一致，并按实际职责隔离业务副作用，避免过度拆分或全量重构。

## Requirements

### Requirement: 前端开发优先调查并复用已有体系
技能（Skill）MUST 在前端页面、交互、样式开发与复用建设时可被发现，MUST 引导智能体（Agent）先核实相关页面、组件（Component）、主题及真实行为，再选择复用、扩展或新增。方法 MUST 适配项目当前技术栈，按完整职责组织代码，MUST NOT 仅因样式或元素存在就机械拆分，也不得以统一方法为由要求全量重构。

#### Scenario: 已有相同交互
- **WHEN** 当前功能需要的选择或阅读交互已有可复用实现
- **THEN** 智能体（Agent）MUST 优先使用共同来源，明确真正需要变化的部分，MUST NOT 默默复制另一套行为

#### Scenario: 不同技术栈或简单修复
- **WHEN** 目标项目采用不同框架，或任务仅调整已明确的局部内容
- **THEN** 技能（Skill）MUST 沿用适用的现有约定并按影响工作，MUST NOT 强制引入 Buildr Web 的框架或新增全局平台

### Requirement: 正式与模拟入口共享相关源码且隔离副作用
本次需要两类入口的界面 MUST 使用同一份相关组件（Component）及主题源码，数据和真实操作 MUST 可由入口分别接入。模拟入口 MUST 使用模拟数据（Mock Data）和本地操作，MUST NOT 调用真实业务读写、使用真实会话或依赖真实路由执行；真实入口 MUST 保持既有保存时机、错误反馈和版本校验。

#### Scenario: 关联服务的双入口
- **WHEN** 正式与模拟入口均展示关联服务选择
- **THEN** 两者 MUST 复用同一界面源码和选择语义；模拟选择 MUST 只更新演示状态，正式选择 MUST 经既有保存能力处理

#### Scenario: 来源改变后的接续
- **WHEN** 相关共享源码改变且演示成果仍引用旧内容
- **THEN** 智能体（Agent）MUST 识别受影响成果并重建、复验，MUST NOT 把旧验证报告描述为覆盖新内容

### Requirement: 技能提供可检查的一致性结果
技能（Skill）MUST 引导维护与本次复用相关的输入、操作结果和关键状态示例，核对正式与模拟入口的实际行为，并说明未覆盖部分；MUST NOT 用文件数量、目录整齐或文字声明替代源码复用与行为证据。

#### Scenario: 同源复用验收
- **WHEN** 智能体（Agent）声称完成前端复用改造
- **THEN** MUST 能指明两个入口共同使用的源文件并演示关键行为，MUST 明确模拟与真实副作用的边界

### Requirement: 前端开发不得自动触发原型制作
技能（Skill）MUST 区分开发复用与原型授权；识别新增关键页面、主要布局或核心功能交互变化且存在实质设计选择时，MUST 在用户尚未表达偏好时询问是否需要原型，MUST NOT 仅凭改动规模自动制作。普通小改动 MUST 默认直接实施，只有用户明确同意才可调用原型技能（UI Prototype Skill）；同一任务已有明确授权或拒绝 MUST 继续适用。

#### Scenario: 小改动与未授权大改动
- **WHEN** 智能体（Agent）处理小改动，或识别到大改动但用户尚未授权原型
- **THEN** 小改动 MUST 直接实施；大改动 MUST 先询问原型偏好，MUST NOT 将前端开发授权当作原型授权

### Requirement: 正式前端实施必须接续讨论阶段的原型
用户决定实施且已有未被明确忽略的原型时，前端开发技能（Frontend Development Skill）MUST 在正式编辑前核对原型的确认版本与保存位置，尚未归入任务时 MUST 接续原型技能（UI Prototype Skill）的归入流程；MUST NOT 仅因文件可打开而视为任务内可发现，也不得重新询问是否制作原型。

#### Scenario: 从临时预览继续实施
- **WHEN** 用户说按已有临时原型实施
- **THEN** 智能体（Agent）MUST 先按原型技能核对并保全成果、报告任务展示结果，再依据确认设计实施

#### Scenario: 没有原型的普通修复
- **WHEN** 已明确的局部修复没有原型
- **THEN** 智能体（Agent）MUST 继续直接实施，不额外制作原型或建立归入记录
