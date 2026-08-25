## Why

`close-formal-verification-runtime-boundary` 已成功交付代码，却暴露两个曾处理过但未被当前契约完整保护的收尾回归：Finish 在物理 carrier 仍存在时投影为 `cleaned`，以及包含 Workspace SQLite migration 的交付在合法写入激活前运行只读 Doctor。前者让 self-bootstrap 把本 run 误判为不可证明载体，后者制造 `runtime target > retained store` 的必然中间态，两者共同阻断已交付任务的激活和环境清理。

## What Changes

- 将 Finish-owned carrier cleanup 与 Task Environment cleanup 分成独立结果：Environment attention 不得跳过 carrier cleanup，也不得使 carrier cleanup 被误报为成功。
- 只有精确 `git worktree remove` 成功、registration 消失且物理路径不存在时，稳定投影才能声明 carrier `cleaned/root=null`；否则保留真实 root 与 owner recovery。
- 删除以 `cleanup phase=passed` 推断全部 carrier 已清理的兼容逻辑；历史 `complete` run 必须从明确 carrier cleanup 事实或当前现场投影。
- 当交付引入 pending Workspace Structured Store migration 时，由 matching Finish/self-bootstrap Activation 的 retained writer 在最终 Doctor 前原子应用；Doctor 继续只读。
- Activation 失败只保留同一 run 的恢复入口，不撤销 Delivery、不重跑 Candidate、Verification 或业务推送。
- 增加原任务真实故障形态的回归：Environment cleanup attention + 非空 carrier、v18 store + delivered migration 19、同 run recovery、最终 Doctor 和 cleanup。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`：明确 self-bootstrap 对当前 carrier 的真实状态消费、owner recovery，以及 writable Activation 必须先于最终 Doctor。
- `task-environments`：明确 Environment cleanup 与 Finish-owned carrier cleanup 的独立性，以及历史已交付 Task Contribution 的可重建 cleanup proof。

## Impact

- 受影响实现：`src/task/application/finish`、`src/task/infrastructure/git-worktree-provider.mjs`、`src/infrastructure/sqlite/workspace-sqlite.mjs`、self-bootstrap bundled runner 及 Finish maintenance 投影。
- 受影响验证：Task Finish integration/system、Task Environment cleanup、self-bootstrap closeout、migration/Doctor 顺序与原 run recovery。
- 不改变 Task Record、Task Development、Verification Result、Review、Delivery 成立条件或 Doctor 只读权限；不新增数据库表、事件平台、自动重试或跨 owner 删除权限。
