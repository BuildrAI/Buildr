## ADDED Requirements

### Requirement: Finish repository 必须支持按 Task 安全读取既有 completed Result
Task Finish MUST 提供最窄的按 Task 只读查询，复用 `.buildr/task-finish/runs/<run-id>.json` 与 `.buildr/task-finish/completed/<run-id>.json` 现有 authority。查询 MUST 校验固定目录、普通 JSON 文件、current schema、Task identity 与 completion identity，MUST NOT 新增 writer、数据库表、索引、缓存或聚合 store。

#### Scenario: 多个 run 中后续成功
- **WHEN** 同一 Task 先有 blocked/failed run，后来存在身份匹配的 complete Result
- **THEN** 查询 MUST 返回匹配的成功 complete Result
- **AND** 旧失败 run MUST NOT 覆盖成功事实

#### Scenario: Finish 文件损坏
- **WHEN** 与目标 Task 相关的候选 Finish 文件无法安全解析或 completion identity 不完整
- **THEN** 查询 MUST 返回不可安全核验诊断
- **AND** MUST NOT 跳过关键损坏后推断 delivered

### Requirement: delivered 必须由完整 Finish 事实 fail closed 派生
terminal delivery projection MUST 至少验证 Task completed 且非 noChange、Finish status 与 completion complete、Task ID、handoff identity、Candidate identity/generation、Content Target identity、carrier equivalence、remote readback、retained activation/Doctor 与 Environment cleanup。任一关键事实缺失或不匹配时 MUST NOT 返回 delivered。

#### Scenario: 完整匹配的成功交付
- **WHEN** 全部 Task、handoff、Candidate、Content Target、carrier、remote 与 cleanup facts 完整匹配
- **THEN** projection MUST 返回 delivered、final remote ref、完成时间与 cleanup 摘要

#### Scenario: 任一关键 identity 不匹配
- **WHEN** Finish taskId、handoff、Candidate identity/generation 或 Content Target identity 任一不匹配
- **THEN** projection MUST fail closed 为 completed-unproven 或 unavailable
- **AND** MUST NOT 显示 delivered
