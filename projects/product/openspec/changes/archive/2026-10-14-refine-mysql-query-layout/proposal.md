## Why

当前 MySQL 查询独占中屏，且编辑与结果高度固定，导致底部空白和无法按工作内容分配空间。用户要求与现有三屏一致的右屏查询和可调整区域；本次不包含接口、数据或存储兼容性破坏。

## What Changes

- 连接目录留在中屏，查询在现有右屏工作面打开。
- 上方数据库栏与编辑区左右可调，下方结果横跨整个查询工作面；上下区域可调并利用全部可用高度。
- 默认数据库栏约 200 像素、上方数据库/编辑与下方结果约 4:6；尺寸按工作空间在本机记忆。
- 结果表格跟随容器高度，关闭再打开同一查询保留草稿和结果。
- 修正预览目标工作空间，并为规范来源实时预览增加显式只读认证来源选择，让已保存的连接可以验收查询。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `mysql-query`：增加右屏承载、满高及区域尺寸调整要求。
- `worktree-buildr-web-preview`：显式同渠道只读认证来源和配置写入保护。

## Impact

影响 `buildr-web` 的 ConnectionsPage、MySqlQuery、MySqlResults 及现有工作面装配；复用 WorkspaceStage、ResizablePanels 与 SplitDivider。后端仅补充受控预览的只读认证来源；保留数据库只读约束，不引入依赖。
