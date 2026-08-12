## 1. Finish 与 terminal Application read model

- [x] 1.1 为现有 Finish JSON repository 增加按 Task 的窄只读查询与 schema/identity fail-closed 测试
- [x] 1.2 实现 terminal Task delivery composer，覆盖 delivered、completed-no-change、completed-unproven、abandoned、unavailable 与 active passthrough
- [x] 1.3 关联 immutable handoff 与 Review/Verification Result digest/target identity，不改写其 live applicability

## 2. Local App API 与 Web

- [x] 2.1 让 Task development/reviews/verification HTTP read routes 复用 terminal Application projection，并保持 workspaceId/Task ID allowlist
- [x] 2.2 优化研发页的交付结论、快照、remote ref、完成时间、cleanup 与技术详情层级
- [x] 2.3 优化证据页交付时文案、planning gate disposition、Verification 单卡宽度与原始 evidence 展示

## 3. 自动化验证与认知收敛

- [x] 3.1 扩展 Application/Local App integration 与 contract tests，覆盖 active、noChange、identity mismatch、多 Finish run、abandoned 和安全边界
- [x] 3.2 拆分 Browser Smoke fixture 并覆盖 active unknown/current/stale、completed delivered/unproven 与 terminal evidence
- [x] 3.3 运行 focused tests，修复所有直接回归
- [x] 3.4 核对 Brief、delta specs、实现和术语；更新 knowledge impact 并完成 OpenSpec strict/proposal guard
- [x] 3.5 收敛并归档 Change，确认 current specs 与最终实现一致
