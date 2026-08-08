## ADDED Requirements

### Requirement: 专业 current rows 必须保存读取所需的规范化事实
Workspace Structured Store MUST 在完整专业 payload之外保存最小可查询事实：Development row 保存最近一次正式 action 的 applicability status/JSON与observed time；Review row 保存 review type、target identity、outcome与updated time；Verification row 保存target identity、outcome与updated time。规范化字段 MUST 与同 row Domain payload一致，MUST NOT复制专业正文、Development gate adoption、Task status、Environment Receipt或Finish association。

#### Scenario: Development action 原子保存
- **WHEN** Development Application 已形成新的合法 Receipt 与该 action applicability
- **THEN** repository MUST 在同一 transaction 中写入 `record_json`、applicability fields与observed time并写后验证
- **AND** 任一字段或post-read失败 MUST rollback整行并保留上一份完整 current value

#### Scenario: Review 或 Verification Result 原子保存
- **WHEN** Review/Verification Application 记录新的完整 Result
- **THEN** repository MUST 从同一 Domain value保存result JSON、target identity、outcome与updated time
- **AND** JSON与规范化字段不一致时 MUST在commit前blocked

### Requirement: task_lifecycle_current 必须通过连续 migration 安全退役
Buildr MUST 通过新的连续 migration升级专业 current schema、迁移可证明的 Development applicability、核验 terminal association并最终删除 `task_lifecycle_current`。Migration MUST在删除前以专业表为authority处理冲突，MUST NOT修改任何已登记script bytes/checksum、从 lifecycle覆盖Task/Environment/Result/Finish事实或静默丢弃无法匹配的terminal association。

#### Scenario: fresh database 初始化 latest schema
- **WHEN** current runtime 首次 writable 初始化新 Workspace Structured Store
- **THEN** 完整 migration chain MUST达到专业 current latest schema且latest schema中不存在`task_lifecycle_current`
- **AND** 历史`0006` script MUST仍保留在连续链与ledger identity中

#### Scenario: 部分 lifecycle 数据升级
- **WHEN** 旧数据库包含专业 current rows但缺少部分或全部 lifecycle section
- **THEN** migration MUST保留全部合法专业 payload，并只迁移存在且可验证的Development applicability
- **AND** 没有安全来源的Development observation MUST读取为unknown，不得扫描外部事实或伪造current/stale

#### Scenario: Environment authority 与 lifecycle 冲突
- **WHEN** lifecycle Environment summary与`task_environment_current`状态或Receipt不同
- **THEN** migration MUST保留`task_environment_current`原值并丢弃重复summary
- **AND** MUST NOT用lifecycle内容覆盖、合并或降级Environment authority

#### Scenario: terminal association 可证明
- **WHEN** lifecycle row包含terminal association且同Task Finish completion保存匹配handoff、Candidate与gate identities
- **THEN** migration MUST保留Finish completion作为唯一事实并允许删除lifecycle row
- **AND** MUST NOT再次复制association到其他表

#### Scenario: terminal association 无法安全迁移
- **WHEN** lifecycle terminal association没有matching Finish completion或关键identity不一致
- **THEN** migration MUST fail closed并rollback该version的schema、data与ledger effects
- **AND** 原数据库 MUST继续保留完整`task_lifecycle_current`与专业 rows

#### Scenario: 旧 runtime读取升级数据库
- **WHEN** ledger已包含当前旧runtime不认识的退役migration
- **THEN** 旧runtime MUST返回`database-newer-than-runtime`
- **AND** MUST NOT重建`task_lifecycle_current`、降级schema或继续业务读写

## MODIFIED Requirements

### Requirement: Environment current 必须使用独立窄 SQLite schema
Workspace Structured Store MUST 以独立 `task_environment_current` table 保存每个正式 Task 的 Environment current Receipt。该表 MUST 使用 `task_id` 作为唯一主键并以 foreign key 绑定 `tasks(task_id)`，至少保存经过 Domain 校验的 `receipt_json`、可查询的 `status` 和 `updated_at`；MUST NOT 把 Environment 字段并入 `tasks`、建设通用 key/value/history/event/audit 表或复制 Environment facts到其他current projection。

#### Scenario: fresh Workspace 初始化 Environment schema
- **WHEN** current runtime 初始化新的 Workspace Structured Store
- **THEN** 连续 migrations MUST 建立 `task_environment_current`、Task foreign key、JSON validity constraint 与唯一 current slot
- **AND** MUST NOT 建立 Environment file index、双写 ledger、history 或远端同步 table

#### Scenario: 已有 Workspace 升级
- **WHEN** 健康数据库已应用到前一 migration version且retained controller执行合法writable action
- **THEN** runner MUST原子应用pending migrations并登记准确checksum
- **AND** MUST保留已有Task、专业current rows与Finish rows，并以Environment current row为唯一authority

#### Scenario: Environment current value 被替换
- **WHEN** Task Environment Application 已完成 Domain normalization 并开始保存完整新 current Receipt
- **THEN** repository MUST 在单一 transaction 中替换精确 `task_id` slot，写后读取验证并提交
- **AND** 任一校验、busy、foreign key 或 integrity failure MUST rollback并保留最后一份有效 current value

#### Scenario: 不存在的 Task 被 Environment writer 引用
- **WHEN** Environment Application 尝试为不存在的 Task ID 写入 current Receipt
- **THEN** foreign key 与 Application validation MUST 拒绝 mutation
- **AND** transaction MUST rollback并保留其他 Environment rows
