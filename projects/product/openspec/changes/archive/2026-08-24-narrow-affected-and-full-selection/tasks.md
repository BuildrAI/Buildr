## 1. Selection authority 与解释投影

- [x] 1.1 将 Full scope pattern、稳定 reason code 与用户解释收敛到唯一 ownership authority，并保留旧 inputs 投影兼容性。
- [x] 1.2 扩展真实 planner selection audit，区分 direct owner、Full 展开、dependency closure 和 evidence boundary/primary owner/public outcome。
- [x] 1.3 让 `test:changed -- --json` 输出同一 plan 的结构化 audit，保留既有字段与人类 reasons 兼容。

## 2. 真实样本与最小收窄

- [x] 2.1 从近期普通 Task 与 sealed Execution Record 建立可复核 before 样本，缺失字段明确标记 missing。
- [x] 2.2 用普通逻辑、Finish、Workspace/Worktree/process、选择 authority、unknown/unowned 及 Candidate/Release 边界反例审计真实选择，并只修正已证明过宽的 mapping。
- [x] 2.3 形成 before/after 指标、Full reason 分布、重型 owner 与 selection/owner-cost 结论，按当前数据重算预算和容量下限。

## 3. 契约、当前认知与 Change readiness

- [x] 3.1 增加 planner/CLI/ownership contract 与 integration 反例，证明 trace、reason code、fail-closed 和 Candidate/Release coverage 不退化。
- [x] 3.2 更新 verification framework、权威 spec、current knowledge、brief 与 knowledge impact，并记录真实收益或无收益结论。
- [x] 3.3 完成 strict validation、convergence preflight、focused/affected 开发反馈和 archive readiness；不把后续 Formal Verification、Completion Review、Finish 或 cleanup 写入 Change checklist。
