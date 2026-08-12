## ADDED Requirements

### Requirement: Production verification 必须使用单一 evidence lifecycle 契约
Verification application 与 selected task-verification provider MUST 为同一 run 生产和消费唯一的版本化 evidence lifecycle，包含 retention、cleanup policy、cleanup status、provider-owned cleanup reference、summary path 与 run identity。新 summary MUST NOT 同时输出相互独立的扁平和嵌套 lifecycle 事实。

#### Scenario: 生成 transient evidence
- **WHEN** `verification run` 未收到 caller-managed output 且创建 provider-owned run directory
- **THEN** summary MUST 标记 transient retention、所有 consumer 完成后清理、retained status 和精确 run directory
- **AND** summary path MUST 位于该目录边界内并绑定同一 run identity

#### Scenario: Task Finish 消费 verification summary
- **WHEN** Task Finish formal assurance 接受当前 Candidate 的 passed summary
- **THEN** provider MUST 保留 lifecycle 原文并在 cleanup readiness 中引用同一 identity
- **AND** MUST NOT 重新推断目录命名或把 summary 改写成另一种 lifecycle schema

### Requirement: Verification cleanup 必须是可安装的产品操作
Selected task-verification provider MUST 提供公开可调用的 `cleanup` operation，按 summary lifecycle 验证 schema、retention、run identity、summary containment 和 provider-owned directory boundary 后，仅删除对应 transient run。测试目录 helper MUST NOT 成为普通 Workspace 或 Task Finish 的唯一清理入口。

#### Scenario: 清理有效 transient run
- **WHEN** 所有 consumer 已完成且 summary 证明 cleanup reference 是当前 provider-owned transient run directory
- **THEN** cleanup MUST 删除该精确目录并返回版本化 `cleaned` evidence
- **AND** 重复 cleanup MUST 幂等返回 already absent

#### Scenario: 兼容旧扁平 lifecycle
- **WHEN** provider 读取受支持版本的旧 summary，生命周期字段是扁平形式且边界仍可唯一证明
- **THEN** cleanup MAY 规范化为 canonical lifecycle 后执行并记录 compatibility source
- **AND** 无法证明时 MUST 返回 retained，不得要求 Agent 手工扩大删除范围

#### Scenario: Cleanup reference 越界
- **WHEN** cleanup reference 不在临时根下、不是当前 run directory、是符号链接或不包含绑定 summary
- **THEN** provider MUST 保留现场并返回稳定 boundary diagnostic
- **AND** MUST NOT 删除 reference 或其父目录
