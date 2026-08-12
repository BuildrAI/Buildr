## ADDED Requirements

### Requirement: terminal Task 必须提供交付时研发快照且不得伪造 live currentness
Task Development 的只读 consumer MUST 能以 Development Receipt 中已冻结的 Task Context、planning、Content Target、verification policy、Candidate/generation 与 immutable handoff 构造 terminal delivery snapshot。该 snapshot MUST 与实时 applicability 分离，MUST NOT 因历史事实已交付而把任一实时轴标记为 current，也 MUST NOT 为读取 terminal Task 恢复或重建 Environment。

#### Scenario: completed Task 的 Environment 已清理
- **WHEN** Task 已 completed、matching Formal Finish Result 已证明交付且 Environment cleanup 已完成
- **THEN** read model MUST 返回交付时研发快照与 delivered 主结论
- **AND** 六个实时 currentness 轴 MUST NOT 被伪装为 current

#### Scenario: active Task 的 Environment 不可用
- **WHEN** active Task 无法重新观察 current Content Target
- **THEN** 原有 live applicability MUST 继续返回 unknown
- **AND** terminal delivery projection MUST NOT 误报 delivered

#### Scenario: abandoned Task
- **WHEN** Task status 为 abandoned 且存在历史 Development Receipt
- **THEN** read model MUST 只返回历史快照与 abandoned 结论
- **AND** MUST NOT 重新判断、恢复或生成 Candidate
