# Design: 单一 post-Finish 自举权责

## Decision

以已交付的新 requirement“Buildr自举Component必须统一执行post-Finish activation”为唯一自举 lifecycle authority。旧 pre-Finish prepare/publish requirement 直接删除，不保留兼容 route、恢复 token 分支或双阶段描述。

package verification 继续覆盖 `already-contained` 与普通 Workspace 隔离，同时把自举断言改为：Formal Finish 完成后才执行单一 activation；冻结路径未命中时为 `not-applicable`；失败不改写 Finish。

## Compatibility

这是对尚未交付 Candidate 的 canonical contract 修正。没有公开 Result schema 或用户迁移；旧文档语义不作为兼容行为保留。
