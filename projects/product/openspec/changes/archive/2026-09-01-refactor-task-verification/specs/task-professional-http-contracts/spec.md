## ADDED Requirements

### Requirement: Task专业HTTP不得公开Execution Record
Task专业HTTP operation catalog MUST不登记Execution Record list、detail或body-file接口。Task Verification和Task Finish MUST分别通过自身Application提供当前事实，不建立通用执行记录读模型。

#### Scenario: 客户端请求旧Execution Record route
- **WHEN**客户端请求旧Task Execution Record HTTP路径
- **THEN**router MUST按不存在的产品接口处理
- **AND** MUST不扫描SQLite或本机正文目录

### Requirement: Task Verification HTTP必须只公开报告读取和Agent提示
Task Verification HTTP MUST只提供报告inspect与Agent prompt。Inspect request MAY包含当前内容版本用于applicability比较；prompt request MUST只包含Task ID。HTTP MUST NOT接收Candidate、generation、target identity、declaration list、Plan、record IDs、outcome声明或测试执行参数。

#### Scenario: Web读取任务验证报告
- **WHEN**客户端请求Task Verification read operation
- **THEN**接口MUST返回Application的report slot、report digest和current/stale/unknown applicability
- **AND** MUST不执行测试、读取Execution Record或修改任何专业事实

#### Scenario: Web请求Agent验证提示
- **WHEN**客户端以Task ID请求prompt
- **THEN**接口MUST返回指导Agent直接执行项目测试并在完成后record报告的prompt
- **AND**复制prompt MUST NOT等于报告已记录
