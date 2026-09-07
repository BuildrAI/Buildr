## ADDED Requirements

### Requirement: Task详情必须只读展示current任务验证报告
Buildr Web MUST在Task“证据”页展示任务验证报告presence、内容版本、Task scope、测试地图、实际checks、gaps、结论、report digest、完成时间和current/stale/unknown applicability。页面 MUST通过Task Verification Application读取，MUST不从Development gate或Execution Record派生报告。

#### Scenario: 查看已有报告
- **WHEN**用户打开有current任务验证报告的Task证据页
- **THEN**页面MUST显示实际测试体系、选择范围、targets、结果、未覆盖项和结论
- **AND** GET MUST不执行测试、观察Git或修改Task事实

#### Scenario: 报告不存在
- **WHEN**Task尚无报告
- **THEN**页面MUST显示“开发完成后交给智能体验证”的空状态
- **AND**其他Task专业视图MUST正常工作

### Requirement: Buildr Web必须生成独立Task Verification Agent prompt
证据页Agent Action MUST只提交Task ID并生成指导Agent读取Task、改动、测试地图和项目测试事实、直接执行测试、最后record报告的prompt。Buildr Web MUST不生成测试Plan、target identity、Candidate或报告内容。

#### Scenario: 用户请求开始验证
- **WHEN**用户触发“交给智能体验证”
- **THEN**prompt MUST说明开发中的测试不记录、开发完成后才保存有意义报告
- **AND**复制prompt MUST NOT修改报告

## REMOVED Requirements

### Requirement: Task 详情必须只读投影 current Verification Result
**Reason**: Candidate-bound Verification Result被独立任务验证报告取代。
**Migration**: 页面读取report slot。

### Requirement: Buildr Web 必须生成受限 Task Verification Agent prompt
**Reason**: v3执行/reconciliation prompt退出。
**Migration**: 使用独立Agent验证与报告prompt。

### Requirement: 正式 Local HTTP Server 必须整点调度 ExecRecord GC
**Reason**: Task Execution Record整体删除，不再存在GC对象。
**Migration**: 删除scheduler注册。

### Requirement: Buildr Web HTTP 必须开放 Task-scoped execution record 只读接口
**Reason**: Task Execution Record整体删除。
**Migration**: 删除Execution Record HTTP route与Web面板；分别展示Task Verification Report和Task Finish Result。

### Requirement: Execution Record 读取必须进入 bounded Buildr Web read executor
**Reason**: Execution Record读取接口和正文存储整体删除。
**Migration**: 无。
