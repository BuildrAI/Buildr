# task-review-results Specification

## Purpose

定义一个 Task Review capability、两个可选 current Result 槽位、最小数据模型、target applicability、唯一 writer、安全替换与只读聚合。

## Requirements

### Requirement: Task Review 必须使用一个能力维护两个可选 current Result 槽位
Buildr MUST 为正式 Task 提供一个 Task Review capability，并 MUST 在Workspace SQLite中以同一个 `TaskReviewResult` 数据模型维护 `planning` 与 `completion` 两个互不覆盖的可选 current 槽位。Buildr MUST NOT 创建 Task Review Receipt、类型专属 schema、Result 列表或空占位记录。

#### Scenario: 新 Task 尚未执行 Review
- **WHEN** 正式 Task 已存在但没有完成过 Planning Review 或 Completion Review
- **THEN** 两个槽位 MUST 都返回 missing，SQLite MUST 不出现空Review rows

#### Scenario: 两种 Review 都已完成
- **WHEN** 同一 Task 已分别记录一份完整 Planning Result 与 Completion Result
- **THEN** 两个 `(task_id, review_type)` rows MUST 同时存在并分别作为各自类型的 current Result
- **AND** 记录一种类型 MUST NOT 读取后改写、删除或覆盖另一种类型

#### Scenario: 未知 Task 请求记录 Result
- **WHEN** 调用方为不存在的 Task ID 请求 record
- **THEN** Application MUST 返回 blocked 且 transaction零effects

#### Scenario: 旧Review YAML存在
- **WHEN** `.buildr/tasks/<task-id>/reviews/planning.yml`或`completion.yml`存在
- **THEN** Application MUST只读取SQLite对应slot
- **AND** MUST NOT迁移、双写、删除或生成兼容YAML

### Requirement: Review Result 必须使用最小 closed v1 schema
每个 current 文件 MUST 使用 closed `buildr.task-review-result/v1` schema，且 MUST 只包含 `schemaVersion`、`taskId`、`reviewType`、`targetIdentity`、`method`、`reviewed`、`uncovered`、`findings`、`conclusion` 与 `completedAt`。`reviewType` MUST 为 `planning|completion`，`method` MUST 为 `self|independent-agent|human`，`conclusion.outcome` MUST 为 `ready|changes-required`。

#### Scenario: Application 记录完整 Result
- **WHEN** 调用方提交明确 review type、非空 target identity、执行方式、至少一个 reviewed 对象、完整 uncovered/findings 与非空结论
- **THEN** Application MUST 生成 schemaVersion、matching Task ID、matching reviewType 与系统 completedAt，并写入对应 slot

#### Scenario: Result 包含超前字段
- **WHEN** 输入或已有文件包含 revision、resultId、current、applicability、status、reviewer、Agent session、model、duration、policy/environment identity、Candidate components、finding lifecycle、history 或其他未知字段
- **THEN** Application MUST fail closed，MUST 保留已有 current bytes

#### Scenario: Review 没有形成完整结论
- **WHEN** reviewed 为空、uncovered 缺少 reason、target identity 缺失、结论为空或 enum 不受支持
- **THEN** Application MUST 拒绝记录，MUST NOT 用 blocked/draft/incomplete Result 覆盖 current slot

### Requirement: 完整 Review 写入必须原子替换且中断不覆盖 current
Repository MUST 只在一份完整 Result 通过校验后，以单一 SQLite transaction 更新精确 slot并在提交前重读验证。输入校验、serialization、mutation或写后读取失败时 MUST rollback并保留原 current value与全部 sibling rows。

#### Scenario: 新 Review 正常完成
- **WHEN** 同类型 current Result 已存在且新的完整 Result 通过全部校验
- **THEN** Repository MUST 精确替换该类型row并返回 changed `resultDigest`
- **AND** 另一类型 Result、Task Record、Environment Receipt 与其他current rows MUST 保持不变

#### Scenario: Review 执行中断
- **WHEN** Agent、工具或人工流程在形成完整结论前中断或失败
- **THEN** `task-review` Skill MUST NOT 调用 record
- **AND** 原 current Result 即使已经 stale 也 MUST 保持原值，且 MUST NOT 被描述为仍适用

#### Scenario: 注入 SQLite mutation 失败
- **WHEN** 精确slot mutation或写后确认失败
- **THEN** operation MUST 返回 blocked 与精确 diagnostic/effects
- **AND** 原 current Result和所有sibling records MUST在rollback后保持不变

#### Scenario: 注入原子替换失败
- **WHEN** fault injection使SQLite精确slot替换或提交前重读失败
- **THEN** operation MUST返回blocked与精确transaction stage diagnostic
- **AND** rollback后原current Result与所有sibling records MUST保持不变

### Requirement: Result 适用性必须由 target identity 派生
Review Result MUST 只持久化 `targetIdentity`，MUST NOT 持久化 applicability 或 current 状态。Application `inspect` MUST 对每种类型使用调用方提供的 matching current target identity 派生 `current|stale|unknown`；Result 缺失时 applicability MUST 为 null。

#### Scenario: target identity 匹配
- **WHEN** Result target identity 与同类型 current target identity 完全相等
- **THEN** read model MUST 返回 `applicability: current`

#### Scenario: target identity 已变化
- **WHEN** Result target identity 与同类型 current target identity 不相等
- **THEN** read model MUST 返回 `applicability: stale`
- **AND** MUST 不删除、改写或覆盖该 Result

#### Scenario: current target 未提供
- **WHEN** Result 存在但调用方没有提供该类型的 current target identity
- **THEN** read model MUST 返回 `applicability: unknown`
- **AND** consumer MUST NOT 把 unknown 描述为满足 Review gate

#### Scenario: Completion 没有 Candidate identity
- **WHEN** 调用方请求记录 Completion Result 但不能提供明确 current Candidate identity
- **THEN** record MUST blocked，MUST NOT 从 Git HEAD、dirty tree、Environment identity、时间或任意内容摘要生成临时 Candidate

### Requirement: Result digest 必须是响应级值 identity 而不是持久 revision
Application MUST 对每份有效 canonical Result value 计算 response-only `resultDigest`，并 MUST NOT 将 digest 或 revision 写入 Result payload。首版 MUST NOT 建设 Result history、expected revision、锁、CAS、租约或同类型多 writer 协议。

#### Scenario: inspect 有效 Result
- **WHEN** Application 成功读取任一 current Result
- **THEN** read model MUST 返回该closed value canonical serialization的稳定 `resultDigest`
- **AND** persisted payload MUST 不包含 resultDigest 或 revision

#### Scenario: Result 被完整替换
- **WHEN** 同类型新完整 Result 与旧 canonical value 不同
- **THEN** 新 read model MUST 返回不同 resultDigest
- **AND** Application MUST NOT 为此生成或递增持久 revision

### Requirement: Review Result 必须保持可移植且不抢占其他 lifecycle authority
Review Result MUST 保持轻量且只保存可移植 reviewed/uncovered 引用与最小语义文本，但作为Workspace本地Task事实 MUST NOT进入Git或本地多机同步。Task Review MUST NOT 保存或拥有 Task 顶层状态、Environment/Runtime、Candidate generation、Verification execution、Finish effects、Agent session、凭证、完整日志或隐藏推理。

#### Scenario: 其他 owner 读取 Task Review
- **WHEN** Task Record、Environment、Verification 或 Finish 处理同一 Task
- **THEN** 它们 MUST 不复制、回填或改写 Review Result 明细
- **AND** consumer需要Review事实时MUST调用Task Review Application

#### Scenario: Git选择普通内容
- **WHEN** Git Operations执行用户已明确选择的源码或普通Git内容操作
- **THEN** Review Result及Workspace SQLite MUST不进入owned paths
- **AND** Review MUST不声明publication route

#### Scenario: Git ignore 评估 Review 文件
- **WHEN** Git ignore或owned-path检查评估Task Review本地事实
- **THEN** Workspace SQLite及其sidecars MUST保持ignored，且MUST不存在可纳入Git的Review current文件
- **AND** Review Application MUST不生成兼容`planning.yml`或`completion.yml`

### Requirement: terminal delivery association 必须与 Review current applicability 分离
Application 层 terminal projection MUST 只读取matching Finish completion中保存的association；当association的handoff gate `resultDigest`、`targetIdentity` 与当前 Review slot完全一致时，才将Result表达为`adopted-at-delivery`。该状态 MUST NOT命名为current applicability，MUST NOT写回Review Result/current row，也MUST NOT依赖独立lifecycle projection。

#### Scenario: Completion Review 已随交付候选采用
- **WHEN** completed delivered Task 的Completion Result digest与Candidate target identity均匹配Finish completion association
- **THEN** terminal projection MUST表达“已随交付候选采用”及原始conclusion
- **AND** 当前Result与保存Development gate的匹配关系 MUST作为独立保存值诊断

#### Scenario: Planning Review missing 且 gate not-applicable
- **WHEN** Planning Review slot missing，但Finish completion association保存的Development handoff planning gate disposition为not-applicable
- **THEN** Review slot MUST仍显示未记录
- **AND** terminal projection MUST另行展示gate disposition、summary与source，不得伪造Planning Result

#### Scenario: digest 或 target identity 不匹配
- **WHEN** Review slot与Finish completion association的gate digest或target identity任一不一致
- **THEN** terminal projection MUST fail closed，MUST NOT标记adopted-at-delivery
- **AND** MUST NOT扫描Git、Finish文件或已删除lifecycle投影寻找替代关联

### Requirement: Review current row 必须保存稳定查询字段
Task Review repository MUST在同一current row保存Domain验证的完整`result_json`、同一Result的`target_identity`、`outcome`与`updated_at`。这些字段MUST只作为结果定位、Overview查询与保存值一致性检查，MUST NOT保存applicability、Development gate adoption、terminal status或第二份Result正文。

#### Scenario: 记录 Review Result
- **WHEN** Application形成新的完整Planning或Completion Result
- **THEN** repository MUST在单一transaction中原子替换JSON与查询字段并写后验证
- **AND** target/outcome/time与Result JSON不一致时 MUST rollback并保留原slot

#### Scenario: 读取 Overview
- **WHEN** Task Overview查询Review摘要
- **THEN** repository MUST通过planning/completion两个`LEFT JOIN` alias返回presence、target、outcome与updated time
- **AND** MUST NOT反序列化或复制完整findings到Overview

### Requirement: Parent Planning Review 必须只绑定 Parent Plan identity
Task Review MUST以Parent Plan内容identity作为Parent Planning Review target；只有outcome、architecture invariants、Contribution Map、dependency graph或final acceptance实质变化 MUST使Result stale。

#### Scenario: Child 专业状态变化
- **WHEN** Child Verification通过、Change归档或Finish完成但Parent Plan未改变
- **THEN** Parent Planning Review applicability MUST保持current
- **AND** Review store MUST NOT写入新的Result

#### Scenario: 显式reconciliation改变Contribution Map
- **WHEN** Parent reconciliation产生新的Parent Plan identity
- **THEN** 旧Planning Review MUST显示stale
- **AND** 新Review MUST只审查五类Parent协调事实

### Requirement: Task Review Application 必须是 Buildr Web 与专业 consumer 的唯一 Result writer
Buildr MUST 由一个共享 Task Review Application 实现 `inspect` 与 `record`，并 MUST 让 CLI、Skill 与 Buildr Web 复用该 Application/read model。调用方 MUST NOT 直接写SQLite、提交完整 next state 或自行生成系统字段。

#### Scenario: Agent 完成语义 Review
- **WHEN** `task-review` Skill 已形成完整语义结果
- **THEN** Skill MUST 只把允许的语义字段交给 Application `record`
- **AND** Application MUST 独占 schema 校验、系统时间、slot选择、serialization、digest 与 persistence effects

#### Scenario: Buildr Web 查看 Result
- **WHEN** Buildr Web 请求 Task Review 详情
- **THEN** HTTP interface MUST 调用 Application `inspect`，MUST NOT 直接读取SQLite、计算 digest 或判断 applicability

#### Scenario: terminal Task 被读取或写入
- **WHEN** 调用方 inspect completed/abandoned Task
- **THEN** Application MUST 允许读取已有 Result
- **AND** 对 terminal Task 的 record MUST fail closed

### Requirement: Planning Review 必须语义审查 Change checklist 生命周期边界
当 current planning nodes 包含 OpenSpec Change `tasks.md` 时，Task Review guidance MUST检查每个 checkbox 是否能在 Change archive 前完成，并 MUST把实际审查的 checklist 记录为现有 Review Result 的 `reviewed` 或在无法覆盖时写入 `uncovered`。发现只能在 archive 后完成的 Formal Verification、Candidate、Completion、Finish、cleanup 或 Task terminal 动作时，Review MUST返回 `changes-required`；Review MUST NOT通过关键词匹配代替语义判断。

#### Scenario: checklist 含归档后生命周期动作
- **WHEN** Planning Review确认某个 checkbox 只能在 Change archive 后由 Task Development 或 Finish authority完成
- **THEN** Review MUST记录精确 finding 并返回 `changes-required`
- **AND** MUST要求修订 planning artifact，而不是让 convergence 自动勾选、删除或绕过该任务

#### Scenario: Change 合法实现同名产品能力
- **WHEN** checklist 文本提到 Verification、Candidate 或 Finish，但该 checkbox 实际是在 archive 前实现或测试对应产品能力
- **THEN** Review MUST按任务语义判断其边界并可将其视为合法 Change-owned action
- **AND** MUST不因命中关键词直接产生 finding

#### Scenario: planning 没有 OpenSpec checklist
- **WHEN** current planning nodes 不包含 `tasks.md` 或 Task 为 code-only
- **THEN** Review MUST如实记录实际 reviewed/uncovered 范围
- **AND** MUST不创建虚假 checklist、finding 或统一必选审查对象
