# task-review-results Specification

## Purpose

定义一个 Task Review capability、两个可选 current Result 槽位、最小数据模型、target applicability、唯一 writer、安全替换与只读聚合。

## Requirements

### Requirement: Task Review 必须使用一个能力维护两个可选 current Result 槽位
Buildr MUST 为正式 Task 提供一个 Task Review capability，并 MUST 以同一个 `TaskReviewResult` 数据模型维护 `planning` 与 `completion` 两个互不覆盖的可选 current 槽位。Buildr MUST NOT 创建 Task Review Receipt、类型专属 schema、Result 列表或空占位记录。

#### Scenario: 新 Task 尚未执行 Review
- **WHEN** 正式 Task 已存在但没有完成过 Planning Review 或 Completion Review
- **THEN** 两个槽位 MUST 都返回 missing，filesystem MUST 不出现空 Review 文件或目录

#### Scenario: 两种 Review 都已完成
- **WHEN** 同一 Task 已分别记录一份完整 Planning Result 与 Completion Result
- **THEN** `.buildr/tasks/<task-id>/reviews/planning.yml` 与 `completion.yml` MUST 同时存在并分别作为各自类型的 current Result
- **AND** 记录一种类型 MUST NOT 读取后改写、删除或覆盖另一种类型

#### Scenario: 未知 Task 请求记录 Result
- **WHEN** 调用方为不存在的 Task ID 请求 record
- **THEN** Application MUST 返回 blocked 且零文件 effects

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

### Requirement: Task Review Application 必须是唯一 Result writer
Buildr MUST 由一个共享 Task Review Application 实现 `inspect` 与 `record`，并 MUST 让 CLI、Skill 与 Local App 复用该 Application/read model。调用方 MUST NOT 手写 canonical YAML、提交完整 next state 或自行生成系统字段。

#### Scenario: Agent 完成语义 Review
- **WHEN** `task-review` Skill 已形成完整语义结果
- **THEN** Skill MUST 只把允许的语义字段交给 Application `record`
- **AND** Application MUST 独占 schema 校验、系统时间、路径选择、serialization、digest 与文件 effects

#### Scenario: Local App 查看 Result
- **WHEN** Local App 请求 Task Review 详情
- **THEN** HTTP interface MUST 调用 Application `inspect`，MUST NOT 直接读取 YAML、计算 digest 或判断 applicability

#### Scenario: terminal Task 被读取或写入
- **WHEN** 调用方 inspect completed/abandoned Task
- **THEN** Application MUST 允许读取已有 Result
- **AND** 对 terminal Task 的 record MUST fail closed

### Requirement: 完整 Review 写入必须原子替换且中断不覆盖 current
Repository MUST 只在一份完整 Result 通过校验后，以同目录临时文件加原子替换更新精确 slot。输入校验、serialization、临时写入、替换或写后读取失败时 MUST 保留原 current bytes 与全部 sibling files，并 MUST 只清理可证明属于本次写入的临时文件。

#### Scenario: 新 Review 正常完成
- **WHEN** 同类型 current Result 已存在且新的完整 Result 通过全部校验
- **THEN** Repository MUST 精确替换该类型文件并返回 changed `resultDigest`
- **AND** 另一类型 Result、Task Record、Environment Receipt 与其他 sibling files MUST 保持原 bytes

#### Scenario: Review 执行中断
- **WHEN** Agent、工具或人工流程在形成完整结论前中断或失败
- **THEN** `task-review` Skill MUST NOT 调用 record
- **AND** 原 current Result 即使已经 stale 也 MUST 保持原 bytes，且 MUST NOT 被描述为仍适用

#### Scenario: 注入原子替换失败
- **WHEN** 临时文件已形成但 canonical rename 或写后确认失败
- **THEN** operation MUST 返回 blocked 与精确 diagnostic/effects
- **AND** 原 current Result 和所有 sibling records MUST 可逐字节复核为未变化

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
Application MUST 对每份有效 canonical Result bytes 计算 response-only `resultDigest`，并 MUST NOT 将 digest 或 revision 写入 Result 文件。首版 MUST NOT 建设 Result history、expected revision、锁、CAS、租约或同类型多 writer 协议。

#### Scenario: inspect 有效 Result
- **WHEN** Application 成功读取任一 current Result
- **THEN** read model MUST 返回该文件 canonical bytes 的稳定 `resultDigest`
- **AND** YAML MUST 不包含 resultDigest 或 revision

#### Scenario: Result 被完整替换
- **WHEN** 同类型新完整 Result 与旧 canonical bytes 不同
- **THEN** 新 read model MUST 返回不同 resultDigest
- **AND** Application MUST NOT 为此生成或递增持久 revision

### Requirement: Review Result 必须保持可移植且不抢占其他 lifecycle authority
Review Result MUST 是可 Git 跟踪的轻量 evidence，只保存可移植 reviewed/uncovered 引用与最小语义文本。Task Review MUST NOT 保存或拥有 Task 顶层状态、Environment/Runtime、Candidate generation、Verification execution、Finish effects、Agent session、凭证、完整日志或隐藏推理。

#### Scenario: Git ignore 评估 Review 文件
- **WHEN** Workspace 精确忽略 `.buildr/tasks/*/environment.json`
- **THEN** `reviews/planning.yml` 与 `reviews/completion.yml` MUST 不因 Environment 规则被忽略

#### Scenario: 其他 owner 读取 Task Review
- **WHEN** Task Record、Environment、Verification 或 Finish 处理同一 Task
- **THEN** 它们 MUST 不复制、回填或改写 Review Result 明细
- **AND** P0.3 MUST 不创建 Development Receipt 或 Review handoff gate

### Requirement: Task Review writer 必须声明两个可选 portable publication paths
Task Review writer MUST声明 `buildr.task-review/v1`分别拥有 `.buildr/tasks/<task-id>/reviews/planning.yml` 与 `.buildr/tasks/<task-id>/reviews/completion.yml`；两个current Result均为可选、portable publication eligible，缺失时 MUST保持缺失。

#### Scenario: 只有Planning Result存在
- **WHEN** publication组合Review writer declaration且只有 `planning.yml`存在
- **THEN** scope MUST只纳入planning exact path
- **AND** MUST NOT创建 `completion.yml`或扫描 `reviews/`目录

#### Scenario: 两个Result都存在
- **WHEN** planning与completion均存在且writer可安全读取
- **THEN** scope MUST把两个路径作为同一writer的两个独立exact owned paths
