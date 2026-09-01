# task-professional-http-contracts Specification

## Purpose

定义 Task 专业阶段 HTTP operation 的 Schema authority、严格校验、DTO 投影、typed Client 与契约测试边界。

## Requirements

### Requirement: 专业 Task HTTP operation 必须拥有稳定机器契约

Buildr MUST 为 Environment、Development、Review、Verification、Retrospective、Finish、Execution Record 与 Parent Coordination 已登记的 HTTP operation 提供 Task Interface 所有的 Draft 2020-12 request、success response 和 error Schema，并以稳定 `$id` 与 operation catalog 关联；未登记的其他 HTTP operation 不因本 Requirement 被隐式纳入。

#### Scenario: catalog 覆盖已迁移的专业读取操作
- **WHEN** Buildr 启动或加载 Task HTTP module
- **THEN** overview、development、reviews、verification、coordination、execution-records、execution-record-detail 与 execution-record-body 各有唯一 operation id、request schema id 和 response schema id

#### Scenario: catalog 覆盖专业写入操作
- **WHEN** 客户端调用 Task retrospective PATCH 或 Task review prompt POST
- **THEN** 对应 operation 在 catalog 中拥有稳定 request schema、success response schema 和统一 error envelope schema

### Requirement: 专业 HTTP 输入必须严格校验且不改变原有边界

Buildr MUST 在现有 workspace/path、Origin/session、content-type、body-size、JSON parse 与 write authorization 检查之后，使用复用的 strict Draft 2020-12 validator 校验专业 HTTP DTO；validator MUST 拒绝未知、缺失和非法字段，且 MUST 不自动转换类型、不填默认值、不删除字段。

#### Scenario: 专业读取拒绝未知 query 或字段
- **WHEN** read operation 收到不在其 operation Schema 白名单中的 query、path 或 body 字段
- **THEN** 服务返回稳定 4xx error envelope，且 Application/read worker 不被调用

#### Scenario: Execution Record 保持文件和视图安全白名单
- **WHEN** execution-records 使用不支持的 view、recordId 或 body filename
- **THEN** 服务返回既有稳定错误 code/status，且不得把请求交给文件读取或 worker authority

#### Scenario: 专业写入拒绝非法 body 且不变异输入
- **WHEN** retrospective 或 review prompt body 缺少必需字段、包含未知字段或字段类型非法
- **THEN** 服务返回结构化 validation error，原始 DTO 不被修改，且对应 writer 不被调用

### Requirement: Interface DTO 必须显式映射到专业 Application authority

Buildr MUST 将校验后的专业 Interface DTO 通过能力边界的显式 mapping 传给既有 Application Query/Command/read worker；HTTP DTO MUST NOT 直接成为 Domain、Persistence Row、SQLite 或 writer model。

#### Scenario: 合法专业读取保持既有 Application 结果
- **WHEN** 合法请求通过 validator
- **THEN** handler/read executor 只调用对应现有 Application/read method，并返回其既有 payload 语义，不改变 lifecycle 或 authority

#### Scenario: 专业写入保持 digest/conflict/terminal 语义
- **WHEN** 合法 retrospective mutation 触发 digest conflict、terminal 状态或其他 Application 错误
- **THEN** 服务保留原有错误 code/status/details/优先级，不将其改写为通用 schema error

### Requirement: 生成 DTO 与 typed Client 必须由同一 Schema 投影

Buildr MUST 从 Task professional Schema 确定性生成 Buildr backend 与 Buildr Web tracked DTO，并提供 drift check；Buildr Web MUST 通过按能力划分的 typed Client 消费生成 DTO，页面 MUST NOT 为这些 operation 手写第二套 response authority或直接猜测 payload。

#### Scenario: generated DTO 漂移阻断受影响构建
- **WHEN** tracked generated DTO 与当前 Schema 生成结果不一致
- **THEN** contracts check 返回非零并报告 source `$id`、生成物和 drift，受影响 build 不得宣称通过

#### Scenario: Task Detail 使用 typed professional client
- **WHEN** Task Detail 加载 development、review、verification、coordination、execution record 或 retrospective 数据
- **THEN** 页面通过能力 client 获得对应 generated DTO，低层 transport 仍可保留 `unknown` 边界，页面不新增未解释的 payload assertion

### Requirement: 专业 HTTP Contract Test 必须锁定成功、错误和未迁移边界

Buildr MUST 提供真实 Buildr Web HTTP Contract Test，覆盖每个已登记 professional operation 的合法请求、成功 response schema、统一错误 envelope、未知/缺失/非法字段、不变异和既有 security/error precedence；测试 MUST 明确报告未登记 operation，但 MUST NOT 将未迁移的其他 HTTP API 作为本 Change 的全局 hard gate。

#### Scenario: 合法请求和响应通过同一契约
- **WHEN** Contract Test 发送合法专业请求
- **THEN** 真实 HTTP response 按同一 catalog response Schema 校验通过，并证明调用了正确 authority

#### Scenario: 错误 precedence 保持稳定
- **WHEN** 请求同时触发 path/security/body/Schema 或 Application conflict 条件
- **THEN** Contract Test 观察到既有优先级和稳定 error envelope，且不存在被 Ajv 泛化覆盖的回归

#### Scenario: 未迁移 operation 只形成诊断
- **WHEN** coverage check 发现不在本 Child catalog 的 Task/Workspace/Runtime/System operation
- **THEN** 输出可读 migrated/unmigrated 诊断，不阻断 unrelated CLI、read-only work 或其他 Child 的独立交付

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
