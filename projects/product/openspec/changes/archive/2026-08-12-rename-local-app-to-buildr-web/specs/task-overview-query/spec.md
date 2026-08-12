## MODIFIED Requirements

### Requirement: Task Overview 必须从专业 current facts 组合读取
Buildr MUST 通过只读 Task Overview Application 从 Workspace SQLite 中组合 Task Record、Development、Planning/Completion Review、Verification、Environment 与 Finish 的已保存 current 摘要。Repository MUST 对单个 Task 使用一个 read-only connection 与一条参数化 `LEFT JOIN` 查询取得这些 facts，且Finish只JOIN `task_finish_current`；MUST NOT 持久化聚合 JSON、复制完整专业 payload、为phase展开额外查询或建立第二 writer。

#### Scenario: 读取 active Task 全貌
- **WHEN** Buildr Web 或内部 consumer 请求一个已有 active Task 的 Overview
- **THEN** Application MUST 返回 Task status、各专业 row presence、保存的 status/target/outcome/observed time 与Finish current或terminal摘要
- **AND** 查询 MUST NOT 随专业模块数量重复打开数据库、同时JOIN旧run/completion表或逐模块调用writer Application

#### Scenario: 专业 row 缺失
- **WHEN** Task 存在但一个或多个专业 current row 尚未形成
- **THEN** Overview MUST 对对应 section 返回稳定 missing/unknown 语义并保留其他已保存 facts
- **AND** MUST NOT 创建占位 row、回填聚合状态或把缺失解释为失败

### Requirement: Task Overview 与专业 inspect 必须只计算无副作用保存值关系
Task Overview、Task Development/Review/Verification inspect 与 Buildr Web GET MUST 只读取 SQLite 中已保存的 payload和查询字段，并 MAY 计算 row presence、payload digest、响应格式及已保存 identity 之间的一致性。它们 MUST NOT 在读取时执行 Git observation、Content Target scan、Project registry/`verification.yml` 解析、Environment probe、Finish filesystem scan、旧 Environment/Development/Result file 读取或数据库 mutation。

#### Scenario: 比较保存的 gate 与 Result identity
- **WHEN** Overview 同时读取 Development gate 与 Review/Verification current row
- **THEN** Application MAY 比较两份已保存的 target identity/result digest 并报告 matched/mismatched/unknown
- **AND** MUST NOT 把该比较解释为对当前外部世界的重新验证

#### Scenario: 外部事实在最近一次 action 后变化
- **WHEN** Git、Content Target、declaration、Environment 或 provider 在最近一次专业 action 后变化
- **THEN** GET MUST 继续返回最近一次 action 保存的事实与 observed time
- **AND** 只有拥有该观察语义的下一次正式专业 action MAY 更新保存状态

### Requirement: Task 轻量查询必须组合复盘来源关系
Task 列表与详情的 SQLite read model MUST 从 Task Record owner tables 读取 `retrospectiveSourceTaskIds`，并 MAY 对单个 source Task 派生承接 Task 的 ID、title 与 status。查询 MUST 保持只读、固定数量 SQL，不得读取复盘 Markdown、专业 currentness 或建立关系缓存。

#### Scenario: 查看目标 Task 来源
- **WHEN** Buildr Web 读取一个具有多个复盘来源的 todo 或 active Task
- **THEN** read model MUST 返回去重后的 source Task 摘要
- **AND** MUST NOT调用 Task Retrospective writer 或复制原始报告

#### Scenario: 查看源 Task 承接列表
- **WHEN** Buildr Web 打开 terminal source Task 的复盘页
- **THEN** read model MUST 返回全部当前承接 Task 摘要
- **AND** 目标状态变化 MUST 由下一次查询直接反映
