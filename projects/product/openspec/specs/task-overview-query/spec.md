# task-overview-query Specification

## Purpose

以一次纯SQLite联表查询组合Task与专业current摘要，不建立聚合store或第二writer。

## Requirements

### Requirement: Task Overview 必须从专业 current facts 组合读取
Buildr MUST 通过只读 Task Overview Application 从 Workspace SQLite 中组合 Task Record、Development、Planning/Completion Review、Verification、Environment 与 Finish 的已保存 current 摘要。Repository MUST 对单个 Task 使用一个 read-only connection 与一条参数化 `LEFT JOIN` 查询取得这些 facts；MUST NOT 持久化聚合 JSON、复制完整专业 payload 或建立第二 writer。

#### Scenario: 读取 active Task 全貌
- **WHEN** Local App 或内部 consumer 请求一个已有 active Task 的 Overview
- **THEN** Application MUST 返回 Task status、各专业 row presence、保存的 status/target/outcome/observed time 与 Finish current/completion 摘要
- **AND** 查询 MUST NOT 随专业模块数量重复打开数据库或逐模块调用 writer Application

#### Scenario: 专业 row 缺失
- **WHEN** Task 存在但一个或多个专业 current row 尚未形成
- **THEN** Overview MUST 对对应 section 返回稳定 missing/unknown 语义并保留其他已保存 facts
- **AND** MUST NOT 创建占位 row、回填聚合状态或把缺失解释为失败

### Requirement: Task Overview 与专业 inspect 必须只计算无副作用保存值关系
Task Overview、Task Development/Review/Verification inspect 与 Local App GET MUST 只读取 SQLite 中已保存的 payload和查询字段，并 MAY 计算 row presence、payload digest、响应格式及已保存 identity 之间的一致性。它们 MUST NOT 在读取时执行 Git observation、Content Target scan、Project registry/`verification.yml` 解析、Environment probe、Finish filesystem scan、旧 Environment/Development/Result file 读取或数据库 mutation。

#### Scenario: 比较保存的 gate 与 Result identity
- **WHEN** Overview 同时读取 Development gate 与 Review/Verification current row
- **THEN** Application MAY 比较两份已保存的 target identity/result digest 并报告 matched/mismatched/unknown
- **AND** MUST NOT 把该比较解释为对当前外部世界的重新验证

#### Scenario: 外部事实在最近一次 action 后变化
- **WHEN** Git、Content Target、declaration、Environment 或 provider 在最近一次专业 action 后变化
- **THEN** GET MUST 继续返回最近一次 action 保存的事实与 observed time
- **AND** 只有拥有该观察语义的下一次正式专业 action MAY 更新保存状态

### Requirement: Terminal Delivery 必须直接读取 Finish completion association
Terminal Delivery Application MUST 从 `task_finish_runs`、`task_finish_completions`、Task Record 与 Development current Receipt 组合 current/terminal read model。delivered 判断 MUST 只使用同 Task compact Finish completion 中已保存的 association，并对 handoff、Candidate 与 gate 的保存 identity/digest 做确定性匹配；MUST NOT 依赖 lifecycle projection 或扫描 legacy/transient files。

#### Scenario: matching Finish completion
- **WHEN** completed、非 noChange Task 具有 matching compact completion 与 terminal association
- **THEN** Application MUST 返回 delivered、delivery/cleanup facts、交付时 Development snapshot 与 gate associations
- **AND** MUST NOT 恢复 Environment、观察 Git/remote 或改写专业 current rows

#### Scenario: completion association 缺失或不匹配
- **WHEN** completed、非 noChange Task 没有 matching completion/association，或保存 identity 与 Development handoff 不一致
- **THEN** Application MUST 返回 `completed-unproven` 与精确诊断
- **AND** MUST NOT 从已删除 lifecycle projection、legacy Finish file 或外部系统补造 association
