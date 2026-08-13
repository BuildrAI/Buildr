## 1. Task source snapshot

- [x] 1.1 将 Git source inventory 分为当前存在路径与相对原任务基线的删除路径，并只在临时 index 中分别 add/remove。
- [x] 1.2 增加未提交 active Change 移入 archive 的回归测试，证明旧路径删除、新路径新增且原 Task index/工作树不变。

## 2. Finish run 安全恢复

- [x] 2.1 用 closed phase、failure、resume 与 owner facts 实现窄的 replaceable run 分类，兼容既有 carrier-preparation failure。
- [x] 2.2 更新 superseded/conflict 诊断，避免继续把可替换范围误称为 preflight-only。
- [x] 2.3 增加 prepare terminal failure 可由新 handoff 取代，以及 blocked/owner-fact/后续阶段状态继续 fail closed 的产品级测试。

## 3. 当前认知与验证反馈

- [x] 3.1 将 Buildr Service 当前说明从 preflight-only 更新为窄的 carrier ownership 前 prepare failure 边界，并完成 knowledge impact reconcile。
- [x] 3.2 运行受影响的 Task Contribution、Task Finish application/product journey 与 contract 测试，修复发现的问题。
- [x] 3.3 运行 `openspec validate recover-task-finish-prepare-failure --strict` 和适用的 package static/full validation，确认 Change 可进入 deterministic convergence/archive。
