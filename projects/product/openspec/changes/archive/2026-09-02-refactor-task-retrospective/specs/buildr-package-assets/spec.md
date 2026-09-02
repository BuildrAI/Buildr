## ADDED Requirements

### Requirement: Package必须原子交付本机任务复盘文档能力
Buildr package MUST原子交付Task Record新版本、SQLite迁移、固定本机文档读取、Task查询、Buildr Web概览和纯`task-retrospective` Skill。Package MUST不包含`buildr.task-retrospective` contract、binding、Application、Repository、Driver、HTTP处置接口、旧公共JSON或专用来源关系。

#### Scenario: 初始化新Workspace
- **WHEN** 当前package初始化Workspace
- **THEN** SQLite MUST只建立Task-owned复盘文档字段且不得建立旧Retrospective表
- **AND** `.buildr/local/task-retrospectives/` MUST保持Git忽略和本机边界

#### Scenario: 升级旧Workspace
- **WHEN** migration遇到旧复盘正文、处置状态和来源关系
- **THEN** migration MUST直接删除全部旧数据并把现有Task迁入新closed版本且复盘字段为`null`
- **AND** MUST不导出、备份、建立legacy表或双读

#### Scenario: Runtime投射
- **WHEN** package同步Workspace和Agent runtime
- **THEN** MUST投射纯`task-retrospective` Skill和当前Task Record contract
- **AND** MUST删除旧Retrospective contract、binding和受管内部route资产

## MODIFIED Requirements

### Requirement: 产品验证覆盖 capability provider replacement
Buildr product verification MUST覆盖仍存在的capability provider默认解析、替换、卸载、歧义、版本冲突和required dependency failure。`task-retrospective`是纯Skill，不参与provider replacement。

#### Scenario: 默认 providers 完成现有工作流
- **WHEN** temporary Workspace使用package defaults
- **THEN** Git Operations、worktree与Task Record consumers MUST解析到声明的provider
- **AND** `task-retrospective` MUST作为无`provides`的可选Skill安装

#### Scenario: 内部 provider 替换 Git Ops
- **WHEN** Workspace替换Git Operations provider
- **THEN** product entry与`task-finish` MUST解析新provider，worktree保持独立
- **AND** MUST不恢复Retrospective capability

#### Scenario: Required provider 缺失或有歧义
- **WHEN** required provider缺失或存在未绑定歧义
- **THEN** doctor MUST报告blocked及根因
- **AND** unrelated Skills MUST保持可用

#### Scenario: Runtime adapters 接收相同解析结果
- **WHEN** Buildr为全部supported Agent adapters渲染同一scope
- **THEN** provider解析与provenance MUST等价

#### Scenario: Transitive provider dependency 被阻断或成环
- **WHEN** required dependency blocked或成环
- **THEN** readiness MUST只传播到受影响consumer并返回稳定根因

## REMOVED Requirements

### Requirement: Package residual gate 防止 Task Review 与 Retrospective 双 authority
**Reason**: Retrospective不再拥有Application authority。
**Migration**: 验证Task Review唯一writer并检查纯Skill不引入第二writer。

### Requirement: Package 原子交付 Task Retrospective v2
**Reason**: v2 contract、provider与内部route整体退役。
**Migration**: 交付Task Record本机文档能力和纯Skill。

### Requirement: Package 必须原子交付 todo Task 与复盘承接能力
**Reason**: todo仍保留，但专用复盘来源关系删除。
**Migration**: todo按普通Task目标承接用户接受的行动。
