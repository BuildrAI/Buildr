## ADDED Requirements

### Requirement: 原型接续必须交接源码隔离身份

原型技能（Skill）MUST 将确认版本、全部页面资源、必要源码来源以及已有实际隔离标识、工作树（Worktree）路径和分支（Branch）一起交给任务分流；有正式任务时 MUST 在其已核验位置维护源码。原型先于正式任务存在时 MUST 保留已核验的源码位置并在后续登记时接续，MUST NOT 为预览强造正式任务，也 MUST NOT 因开发阶段另起位置。仅页面归档或展示目录变化 MUST NOT 改变源码隔离身份。

#### Scenario: 交接已有原型进入开发
- **WHEN** 用户授权根据已有原型开发
- **THEN** 交接 MUST 覆盖确认版页面及源码隔离身份，任务分流 MUST 复用可核验的同目标执行位置
- **AND** 保全确认版和未提交来源后才能继续修改，MUST NOT 以新生成页面冒充旧确认版

#### Scenario: 原型材料进入关联变更
- **WHEN** 已有原型页面归入新关联规范变更或归档目录
- **THEN** 页面保存和引用 MUST 按既有职责处理，MUST NOT 触发另建源码工作树（Worktree）或分支（Branch）

## MODIFIED Requirements

### Requirement: 已有 UI Prototype 默认约束后续前端开发
当当前 Task 已生成一个或多个 UI Prototype，且用户没有明确要求忽略原型时，后续 Agent MUST 在正式前端编辑前读取全部相关原型，并 MUST 按其已确认的信息架构、页面布局和交互方式实施。需要成为正式行为或验收条件的选择 MUST 同步进入 TaskRecord.brief、design、delta specs 和 tasks；原型 MUST NOT 取代这些 authority。

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
