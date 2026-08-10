## ADDED Requirements

### Requirement: Local App 必须展示统一与分专业 execution record 视图
Local App Task 详情 MUST 提供一个共享 execution record 浏览器，支持“全部”“Verification”“Finish”三种筛选并展示多次执行、失败、重试、outcome、lifecycle、resolution、target、producer、时间与正文状态。Verification Result 区块 MUST 提供进入 Verification 视图的入口，Finish current/terminal 区块 MUST 提供进入 Finish 视图的入口；所有入口 MUST 使用同一 API authority 与 record identity，MUST NOT 把 execution record outcome 表达为当前 Result 或交付事实。

#### Scenario: 从统一入口查看
- **WHEN** 用户打开 Task 的 execution record 浏览器并切换筛选
- **THEN** Web MUST 分别请求 `all`、`verification` 或 `finish` view
- **AND** MUST 清晰显示当前筛选与空态

#### Scenario: 从 Verification 区块进入
- **WHEN** 用户在 Verification Result 区块选择查看执行记录
- **THEN** Web MUST 打开同一浏览器的 Verification view
- **AND** 当前 Result 展示 MUST 保持独立

#### Scenario: 从 Finish 区块进入
- **WHEN** 用户在 Finish current/terminal 区块选择查看执行记录
- **THEN** Web MUST 打开同一浏览器的 Finish view
- **AND** Finish current/terminal 展示 MUST 保持独立

### Requirement: Local App 必须按需展示受限正文
Local App Web MUST 在用户选择 record 后按需读取 detail，并只为 detail 声明的正文 filename 请求内容。Web MUST 展示 stored/response truncation、cleaned 或 unavailable 状态和 integrity failure diagnostic；MUST NOT 构造、显示或接受 locator、任意 path 或 cleanup action。

#### Scenario: 打开正文文件
- **WHEN** 用户选择 available record 的一个已声明 filename
- **THEN** Web MUST 请求 Task-scoped body-file API 并以文本预览显示返回内容
- **AND** MUST 标识任何 stored 或 response truncation

#### Scenario: 正文不可用
- **WHEN** record 已 cleaned、open、attention damaged 或 body read 失败
- **THEN** Web MUST 保留 metadata 可见并显示安全 diagnostic
- **AND** MUST NOT 尝试扫描或猜测正文路径
