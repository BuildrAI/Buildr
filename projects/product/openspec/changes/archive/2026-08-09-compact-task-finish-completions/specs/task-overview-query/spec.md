## MODIFIED Requirements

### Requirement: Task Overview 必须从专业 current facts 组合读取
Buildr MUST 通过只读 Task Overview Application 从 Workspace SQLite 中组合 Task Record、Development、Planning/Completion Review、Verification、Environment 与 Finish 的已保存 current 摘要。Repository MUST 对单个 Task 使用一个 read-only connection 与一条参数化 `LEFT JOIN` 查询取得这些 facts，且Finish只JOIN `task_finish_current`；MUST NOT 持久化聚合 JSON、复制完整专业 payload、为phase展开额外查询或建立第二 writer。

#### Scenario: 读取 active Task 全貌
- **WHEN** Local App 或内部 consumer 请求一个已有 active Task 的 Overview
- **THEN** Application MUST 返回 Task status、各专业 row presence、保存的 status/target/outcome/observed time 与Finish current或terminal摘要
- **AND** 查询 MUST NOT 随专业模块数量重复打开数据库、同时JOIN旧run/completion表或逐模块调用writer Application

#### Scenario: 专业 row 缺失
- **WHEN** Task 存在但一个或多个专业 current row 尚未形成
- **THEN** Overview MUST 对对应 section 返回稳定 missing/unknown 语义并保留其他已保存 facts
- **AND** MUST NOT 创建占位 row、回填聚合状态或把缺失解释为失败

### Requirement: Terminal Delivery 必须直接读取 Finish completion association
Terminal Delivery Application MUST 从`task_finish_current`、Task Record与Development current Receipt组合current/terminal read model。delivered判断 MUST只使用同Task且`status: complete`的compact terminal current row中已保存的association，并对handoff、Candidate与gate保存identity/digest做确定性匹配；MUST NOT依赖phase detail、旧run/completion表、lifecycle projection或legacy/transient files。

#### Scenario: matching Finish completion
- **WHEN** completed、非 noChange Task 具有matching compact terminal current与terminal association
- **THEN** Application MUST 返回delivered、delivery/cleanup facts、交付时Development snapshot与gate associations
- **AND** MUST NOT 恢复Environment、观察Git/remote或改写专业current rows

#### Scenario: completion association 缺失或不匹配
- **WHEN** completed、非noChange Task没有matching terminal association，或保存identity与Development handoff不一致
- **THEN** Application MUST返回`completed-unproven`与精确诊断
- **AND** MUST NOT从旧表、已删除lifecycle projection、legacy Finish file或外部系统补造association
