## ADDED Requirements

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
