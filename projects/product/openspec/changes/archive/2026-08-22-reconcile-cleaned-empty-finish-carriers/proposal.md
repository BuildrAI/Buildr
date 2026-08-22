## Why

历史 Task Finish Result 已明确记录全部 repository carrier 为 `cleaned` 且 `root: null`，但旧版本可能遗留精确 run-owned 的空 carrier container。当前自举 runner 仍按活动 carrier 的路径规则证明该目录，因缺少 repository root 将其误判为 `unprovable`，从而阻断后续已交付 Task 的自举激活。

## What Changes

- 让自举 runner 单独识别“已清理 Result 对应的精确空 run container”，并将其归类为 `stale-empty-container`。
- 仅在 run、Workspace、固定受管根、真实目录、非 symlink、全部 carrier cleaned/root null 且目录完全为空时删除该历史残留并继续当前 activation。
- 任一目录非空、symlink、越界、run/Workspace/Result identity 不匹配时继续 fail closed，且 activation effects 为空。
- 保留现有 Finish writer 的 carrier 删除与空 container 收尾语义，不改变普通用户代码、workspace dirty、Delivery 或 Task 生命周期规则。
- 增加兼容成功与安全拒绝的回归测试，并补充诊断分类。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`: 为历史上已被 Product 明确标记 cleaned、但仍遗留精确空 run container 的 Finish Result 增加窄兼容收敛规则。

## Impact

- 影响 Workspace-owned `buildr-self-bootstrap-sync` runner、对应集成/契约测试与 Product 当前知识。
- 不改变 npm package 公共 API、HTTP 契约、SQLite schema、Task Domain/Application/Repository、远端分支策略或普通 workspace 清理规则。
