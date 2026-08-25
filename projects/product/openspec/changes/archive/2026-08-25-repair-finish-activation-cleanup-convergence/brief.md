# 修复 Finish 载体清理与自举迁移顺序

一句话摘要：让已交付Buildr任务的carrier、Workspace migration、自举Doctor与Environment cleanup按真实owner和物理证据闭合，避免内部状态失真阻断收尾。

## 背景与问题

`close-formal-verification-runtime-boundary` 已交付到`origin/dev`，但Finish在Environment cleanup attention后跳过carrier removal，同时把cleanup phase passed误投影为carrier cleaned；self-bootstrap因此把本run的真实非空carrier判为不可证明。该任务新增migration 19后，Finish又在合法structured-store writer激活前运行只读Doctor，形成代码target 19、宿主store 18的中间态。

## 目标与非目标

- 目标：独立处理carrier与Environment cleanup；cleaned绑定物理删除；writable Activation先于最终Doctor；支持同一旧run恢复。
- 非目标：不撤销Delivery、不重跑原Task Verification/Finish、不放宽未知或dirty删除门禁、不让Doctor获得writer权限。

## 受影响角色与流程

- Buildr Agent：得到真实、可恢复且不要求人工猜测的Finish/Activation/Cleanup结果。
- Buildr自举Workspace：在代码schema前进时由matching activation安全升级store，再运行最终Doctor。
- Task Environment：只清理Task-owned checkout/resource，并消费可重建的delivered contribution proof。

## 关键变化

- Finish carrier cleanup不再依赖Environment cleanup成功。
- Stable projection不再从phase passed猜carrier cleaned。
- Finish Activation通过Workspace Structured Store writer应用pending migration，Doctor保持只读；self-bootstrap继续消费同一run。
- 历史已交付run可重建proof并只恢复原owner资源。

## 风险、兼容性与验收

- 旧run缺少新字段时保守投影retained；只有Git/identity/remote事实完整才允许cleanup。
- 验收覆盖原事故形态、同run恢复、Doctor ready、carrier/worktree不存在与remote交付不重复。

## 技术Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Closeout Delta](specs/task-closeout-orchestration/spec.md)
- [Task Environment Delta](specs/task-environments/spec.md)
- [Tasks](tasks.md)
