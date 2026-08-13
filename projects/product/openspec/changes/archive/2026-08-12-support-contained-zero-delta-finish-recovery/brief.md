# 支持已包含零差异的 Task Finish 恢复

## 一句话摘要

让同一 blocked Task Finish run 在 Agent 已确认最新 target 满足原任务语义时，以显式、可审计的零差异 Delivery Adaptation 完成恢复，而不制造伪差异或重复交付提交。

## 背景与问题

现有 Finish 要求 Delivery Adaptation carrier 相对最新 Delivery Baseline 产生非空 tree delta。原 Task Contribution 已进入 target、后续提交又修改重叠路径时，即使 Agent 已审查确认无需新增内容，协议仍把 clean baseline carrier 判为 `delivery-adaptation-missing`。空提交或无关文件差异不能增加语义证据，只会污染历史。

## 目标与非目标

目标是让既有 `adaptation-required` run 在 matching token、current handoff/source、稳定 baseline、run-owned clean carrier 等现有门禁下显式接受零差异适配，并继续 deliver、activation、Doctor 与 cleanup。非目标是让 Buildr 自动证明语义等价、放宽普通 `already-contained` 证明、重建 Candidate/Verification/Review、迁移 SQLite 或引入新的恢复 authority。

## 受影响用户或角色

- 审查并恢复 Git Delivery Adaptation 的 Agent。
- 维护 Task Finish、Buildr 自举激活与正式交付证据的 Buildr 开发者。

## 核心流程

Agent 在同一 `adaptation-required` run 的 run-owned carrier 中确认无需新增文件差异后，使用 matching `--run`、`--resume` 与显式零差异确认恢复。Application 重新核验 handoff、Task Contribution、baseline、carrier ownership/cleanliness 与 target；通过后记录 agent-reviewed zero-delta evidence，不创建 commit或执行 push，并以 `already-contained` 继续 retained activation、Doctor 与 cleanup。target 再次前进时产生新的 target-race，不跨 baseline 沿用审查。

## 关键变化

- `task finish run` 增加仅适用于 matching adaptation resume 的 `--accept-zero-delta-adaptation`。
- carrier actual delta paths 与冻结 Task Contribution activation paths 分离；零差异时前者为空、后者保留原贡献影响面。
- stable zero-delta delivery 记录受控 `already-contained`，跳过 fast-forward/push。
- Task Finish Skill、self-bootstrap runner 与 affected tests 覆盖既有 blocked run、旧 Result 回退和漂移失败路径。

## 影响、风险与兼容性

变更只影响 Buildr Service 的 Finish Application、Git carrier、CLI/Skill 与自举 runner。显式参数不是新的用户风险授权或第二套 review store；误用由 token、run state、identity、baseline 与 cleanliness 门禁失败关闭。Result 只增加 additive evidence，既有 schema id、SQLite authority、普通非零适配及旧 consumer 的 `changedPaths` 行为保持兼容。

## 验收摘要

- 没有显式确认时，clean baseline carrier 仍返回 `delivery-adaptation-missing`。
- matching existing run 显式确认后不新增 carrier commit、不重跑 formal Verification、不 fast-forward/push，并成功记录 zero-delta `already-contained`。
- activation/self-bootstrap 仍按冻结 Task Contribution paths 命中所需动作。
- 错误 token、非法上下文、dirty/baseline/source/handoff 漂移或 target 再次前进均在副作用前失败关闭。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
