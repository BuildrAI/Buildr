# 要求复盘处置取得明确授权

## 一句话摘要

把 Agent 的任务复盘流程拆成只读讨论与获授权写入两个阶段，避免宽泛的“处理复盘”请求被自动解释为处置授权。

## 背景与问题

Task Retrospective Application 的 `currentDigest` 只能阻止陈旧覆盖，不能证明用户同意了 disposition 或后续 Task effects。现有 provider 在用户只要求处理、检查或查看复盘时，可能从重判直接进入 Task 关系写入和 `handle`，越过讨论与实际 mutation 之间的授权边界。

## 目标与非目标

- 宽泛处理请求只允许 inspect、当前事实重判和拟方案展示。
- 用户直接指定完整动作，或明确接受未变化的完整方案后，才允许写入。
- 已授权 facts 或 effects 发生实质变化时重新展示并取得授权。
- 不修改 SQLite、Application、driver、Local App、JSON shape 或 capability identity。

## 受影响用户或角色

主要影响通过 `task-retrospective` Skill 处理正式 Task 复盘的用户与 Agent；Local App 的显式处置按钮保持原行为。

## 核心流程

Agent 先只读 inspect 并展示拟 disposition、理由及 Task 创建或关联 effects。用户继续讨论时保持 `pending` 且零写入；用户直接给出完整处置动作，或接受刚展示且未变化的完整方案后，Agent 才执行精确 effects。重新 inspect 发现事实或方案变化时，旧授权失效。

## 关键变化

- `buildr.task-retrospective/v2` contract 固化明确授权与停止条件。
- provider Skill 增加只读讨论阶段、直接动作例外和方案漂移后的重新授权。
- canonical spec 与 package contract test 共同防止自动处置回退。

## 影响、风险与兼容性

接口、数据和 Local App 保持兼容；变化只收紧 Agent 的写入前置条件。自然语言是否构成完整动作仍需 provider 判断，不确定时固定保持 `pending`。

## 验收摘要

- “处理、检查、查看、分析复盘”不会创建或关联 Task，也不会调用 `handle`。
- 明确指定完整 mutation 时不要求机械二次确认。
- 用户接受方案后只执行已展示 effects；facts 或 effects 变化后必须重新授权。
- contract test 和 OpenSpec strict validation 通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/task-retrospectives/spec.md)
- [Tasks](tasks.md)
