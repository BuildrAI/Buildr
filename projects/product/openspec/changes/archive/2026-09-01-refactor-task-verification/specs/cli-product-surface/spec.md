## ADDED Requirements

### Requirement: Project CLI必须提供测试地图维护入口
Buildr MUST提供`project verification inspect|validate|update <project>`。`validate`和`update` MUST接收Agent生成的候选文件；`update` MUST要求expected identity并在冲突时零写入。CLI MUST不扫描项目自动生成地图或执行测试。

#### Scenario: 校验候选测试地图
- **WHEN** Agent调用`project verification validate <project> --file <candidate>`
- **THEN** CLI MUST只调用Project Verification Application并返回closed diagnostics
- **AND** 当前`verification.yml` MUST保持不变

### Requirement: Task CLI必须只提供任务验证报告入口
Buildr MUST只提供`task verification record <task-id> --report <json-file>`与`task verification inspect <task-id> [--content-identity <identity>]`。CLI MUST不提供`verification plan|run|cleanup`或`task verification reconcile`。

#### Scenario: 保存完成报告
- **WHEN** Agent调用`task verification record`
- **THEN** CLI MUST只解析报告文件并委托Task Verification Application
- **AND** MUST不启动测试或创建Execution Record

## REMOVED Requirements

### Requirement: Project 验证执行必须成为公开 CLI 表面
**Reason**: 通用Project验证执行表面删除。
**Migration**: Agent直接调用项目测试入口；Project CLI只维护测试地图。

### Requirement: CLI 必须提供最小 Task Verification Result 管理入口
**Reason**: 旧Result/reconcile入口被新报告record/inspect取代。
**Migration**: 使用新Task Verification报告命令。

### Requirement: Agent CLI 必须开放 Execution Record 受控恢复
**Reason**: Task Execution Record整体退出。
**Migration**: 删除recover命令。

### Requirement: Agent CLI 必须开放 Task execution record list 与 inspect
**Reason**: Task Execution Record整体退出，没有可读取的通用记录authority。
**Migration**: Agent分别读取Task Verification Report与Task Finish Result。
