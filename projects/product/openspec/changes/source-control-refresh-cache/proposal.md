## Why

源代码管理重新加载页面后从空观察开始，代码库分支和状态逐项出现。用户已确认采用先展示上次结果、后台核对实际变化的方式，减少重复等待，并合并重复被动核对，保持自动读取的共享观察边界。

## What Changes

- 浏览器按工作空间（Workspace）保留有界的上次状态快照，重新加载立即恢复，并明确标示待核对。
- 保留逐库更新和局部失败隔离，无变化不使有效阅读和输入失效；缓存不能代替实时身份和写入前检查。
- 自动观察正确传递共享读取选项，合并同范围在途核对；手动刷新仍立即实际读取。
- 保留两个读取并发及现有外部变化感知，不隐式获取远程、不引入依赖或破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `code-source-control`：补充浏览器快照恢复、待核对边界与同范围自动核对复用。

## Impact

主要影响 `services/buildr-web/src/features/code/`、`src/app/WorkspaceSourceControlProvider.tsx` 及对应逻辑和真实浏览器检查。复用现有后端共享读取，不新增接口（API）、存储权威或状态框架；智能体（Agent）仍使用当前只读接口获得真实观察，缓存仅为网页展示优化。正式任务见[任务说明](@task/source-control-refresh-cache)。
