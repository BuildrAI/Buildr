## ADDED Requirements

### Requirement: Task Record v3必须保存最小复盘文档事实
`buildr.task-record/v3` MUST删除`retrospectiveSourceTaskIds`并新增可空`retrospective`，其中只允许`documentDigest`与`state: pending-decision|decided`。Task Record MUST把固定本机`documentPath`作为只读派生值返回，不在SQLite保存正文或路径。

#### Scenario: 读取没有复盘文档的Task
- **WHEN** Task没有登记本机复盘文档
- **THEN** record的`retrospective` MUST为`null`
- **AND** 该值 MUST不产生失败、待办或自动提示

#### Scenario: 读取已登记文档
- **WHEN** 终态Task已登记合法文档摘要和决定状态
- **THEN** record MUST返回closed复盘文档事实和固定派生路径
- **AND** MUST不返回Markdown正文、旧处置字段或后续来源关系

### Requirement: Task Record必须受控维护复盘文档状态
Task Record update MUST支持登记当前固定文档、标记用户已决定和清除登记三种互斥操作。操作 MUST只接受终态Task并提交当前`recordDigest`；登记必须验证实际文件摘要，标记决定必须匹配已登记与当前文件版本，清除不得删除文件。

#### Scenario: 登记复盘文档
- **WHEN** Agent提交终态Task、当前recordDigest和固定文件的实际摘要
- **THEN** Application MUST保存摘要并设置`pending-decision`
- **AND** 同一事务外的文件或其他Task事实 MUST保持不变

#### Scenario: 标记用户已经决定
- **WHEN** 用户明确决定且调用方提交当前Task版本与已观察文档摘要
- **THEN** Application MUST只把匹配文档设为`decided`
- **AND** 摘要或Task版本漂移时 MUST拒绝写入

#### Scenario: 清除复盘登记
- **WHEN** 用户明确要求移除Task上的复盘关联
- **THEN** Application MUST把`retrospective`设为`null`
- **AND** MUST不删除或改写本机Markdown

### Requirement: Task查询必须直接过滤复盘文档决定状态
Task query MUST支持`retrospectiveState=missing|pending-decision|decided|all`并只读取Task-owned SQLite字段。旧`hasRetrospective`与`pending|handled|no-action`值 MUST退役。

#### Scenario: 查找等待人决定的复盘
- **WHEN** Buildr Web或其他Task查询提交`retrospectiveState=pending-decision`
- **THEN** repository MUST只返回登记状态匹配的Task
- **AND** MUST不读取Markdown、扫描文件系统或调用Agent

#### Scenario: 非法或退役过滤值
- **WHEN** 调用方提交`hasRetrospective`或旧处置状态
- **THEN** HTTP/Application MUST返回稳定字段诊断
- **AND** MUST不降级为`all`

### Requirement: Task Record必须提供固定复盘文档只读投影
Task Record HTTP MUST按Task ID读取固定本机Markdown并返回路径、存在性、实际摘要、登记摘要、登记状态、有效状态、正文和局部诊断。接口 MUST不接受路径或正文写入，并 MUST执行Task ID、普通文件、符号链接和固定体积边界检查。

#### Scenario: 查看当前文档
- **WHEN** Buildr Web请求已登记且摘要匹配的复盘文档
- **THEN** 接口 MUST返回完整Markdown与匹配状态
- **AND** MUST产生零文件和SQLite写入

#### Scenario: 文件缺失或变化
- **WHEN** 固定文件缺失或实际摘要与登记摘要不同
- **THEN** 接口 MUST返回局部availability/currentness诊断和其他Task事实
- **AND** MUST不自动更新状态或阻止其他Task操作

## MODIFIED Requirements

### Requirement: Buildr Web 必须展示并适当管理 Task Record
Buildr Web MUST在已登记Workspace下提供Task轻量列表和详情，并允许人通过Task Record Application有限维护已有Task。Task概览 MUST NOT从复盘文档、Review、Verification、Git或其他专业事实推断lifecycle。

#### Scenario: 浏览 Workspace Task 列表
- **WHEN** 用户进入Workspace Task列表
- **THEN** 页面 MUST从SQLite轻量projection显示Task事实和可选复盘登记状态
- **AND** MUST按`missing|pending-decision|decided`过滤但不得批量读取Markdown

#### Scenario: 查看 Task 详情
- **WHEN** 用户打开具体Task
- **THEN** 概览 MUST显示Task事实与复盘文档固定路径/登记摘要
- **AND** 正文 MUST仅在用户点击查看后单项读取

#### Scenario: 从 Buildr Web 创建或编辑 Task
- **WHEN** 用户编辑已有Task
- **THEN** HTTP MUST调用Task Record update并使用当前record digest
- **AND** 页面 MUST不创建Task或自动生成复盘

#### Scenario: Buildr Web 尝试创建 Task
- **WHEN** 页面或客户端尝试POST Task collection
- **THEN** HTTP MUST视为不存在
- **AND** Agent/Task Manager create能力 MUST保持可用

#### Scenario: 从 Buildr Web 完成或放弃 Task
- **WHEN** 用户明确完成或放弃active Task
- **THEN** 页面 MUST提交合法Task Record mutation
- **AND** 完成后 MUST不自动提示、生成或登记复盘

#### Scenario: Buildr Web 打开 terminal Task
- **WHEN** Task已completed或abandoned
- **THEN** 顶层业务字段 MUST保持只读，概览 MAY按需显示本机复盘卡片
- **AND** MUST不存在Environment或独立复盘Tab、重开入口或绕过Application的写入

### Requirement: Buildr Web Task API 必须保持 Workspace 写安全边界
Buildr MUST在Workspace-scoped Task路径提供list、detail、update、complete、abandon与单项复盘文档只读接口。接口 MUST解析canonical root，复用同源/session/JSON/body size/字段白名单与record digest边界，并 MUST不接受文件路径。

#### Scenario: Task API 使用已登记 Workspace
- **WHEN** workspaceId已登记且有效
- **THEN** HTTP MUST只把真实root和明确input交给Application
- **AND** MUST不混入其他Workspace事实

#### Scenario: Task list 使用合法 query
- **WHEN** collection GET使用`q`、`project`、`service`、`status`、`hasChildren`或`retrospectiveState`
- **THEN** HTTP MUST通过closed Schema和mapping调用Task query
- **AND** MUST拒绝`hasRetrospective`与旧处置状态值

#### Scenario: Task API 提交路径或越界字段
- **WHEN** query/body包含`target`、`root`、`path`、未知字段或专业正文
- **THEN** HTTP MUST在读取或写入前拒绝
- **AND** MUST不回退cwd或调用方路径

#### Scenario: Task API 写请求不可信
- **WHEN** mutation缺少Origin/session、合法JSON、body boundary或必需字段
- **THEN** HTTP MUST拒绝并保持Task不变
- **AND** MUST返回稳定错误envelope

#### Scenario: Task API 输入校验不变异
- **WHEN** DTO含类型错误、缺失或未知字段
- **THEN** validator MUST不转换、填充或删除字段
- **AND** writer MUST不被调用

#### Scenario: Task API 返回既有 result family
- **WHEN** Task操作或复盘文档读取成功，或Application返回业务错误
- **THEN** response MUST匹配对应Schema
- **AND** Task mutation使用v5，detail/list使用v3/v5，文档读取使用独立v1响应

### Requirement: todo Task 必须保持最小数据意向边界
`buildr.task-record/v3` MUST允许显式`todo`且要求Change为空。Review与Verification只接受各自合法Task状态；复盘文档只能登记到terminal Task。reader MUST不因todo存在创建目录、current row或执行事实。

#### Scenario: 读取todo Task
- **WHEN** caller inspect一个todo Task
- **THEN** MUST只返回Task Record事实且`retrospective`为`null`
- **AND** MUST产生零专业写入和零环境副作用

## REMOVED Requirements

### Requirement: Task Record v2 必须只保存最小顶层事实与复盘来源
**Reason**: closed record升级为v3并用本机文档事实替代专用来源。
**Migration**: 既有Task迁入v3，复盘字段统一为`null`。

### Requirement: Task Record 必须保存窄复盘来源关系
**Reason**: 后续行动改用普通Task目标，不保留专用关系。
**Migration**: `task_retrospective_sources`全部直接删除。

### Requirement: Buildr Web Task 详情必须使用四个一级信息视图
**Reason**: 独立复盘Tab删除。
**Migration**: Task详情保留概览、原型、证据，复盘文档进入概览卡片。

### Requirement: Buildr Web Task 列表必须支持复盘处置状态过滤
**Reason**: 旧专业current和处置状态删除。
**Migration**: 直接过滤Task Record的`missing|pending-decision|decided`。
