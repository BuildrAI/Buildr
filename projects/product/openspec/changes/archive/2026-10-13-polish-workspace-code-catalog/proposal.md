## Why

工作空间（Workspace）切换菜单的选中标记使名称错位，代码库（Repository）和子工作树（Worktree）缺少可辨认层级，刷新还会重复枚举同一批目录。用户同时要求分支（Branch）切换后自动更新目录和内容；已发请求的完成不能因原页面卸载而漏掉对应来源的重新观察。

本变更承接[任务说明](@task/workspace-code-polish)。现有规范要求父子来源的名称共用对齐边界，与用户本轮明确要求的树状缩进冲突，现按该决定修订。没有接口、数据格式或授权边界的破坏性变更。

## What Changes

- 工作空间（Workspace）菜单统一名称起点，将选中标记置于名称右侧，保留现有切换、设置和全部工作空间入口。
- 使用可辨认的代码库（Repository）图标；子工作树（Worktree）名称和图标按层级缩进，右侧状态及分支（Branch）操作列继续对齐。
- 分支（Branch）切换成功后立即采用返回的实际分支和提交（Commit）事实，并在后台重新读取受影响内容；读取失败独立呈现。
- 已发切换按原工作空间（Workspace）、代码库（Repository）和工作树（Worktree）身份触发读取更新，同一工作空间（Workspace）的新页面实例也能接收；迟到结果不能改写其他工作空间（Workspace）或回退较新的来源观察。
- 在单次请求内复用工作树（Worktree）清单，减少重复 Git 子进程；这是工程优化，不增加缓存或改变读取协议。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`：补充工作空间（Workspace）切换菜单的名称对齐和选中标记要求。
- `code-source-control`：修订父子来源的缩进与状态列对齐要求，保留真实身份、选择、折叠及局部失败语义。
- `code-branch-management`：补充分支（Branch）切换后的立即更新、后台重新观察及跨工作空间（Workspace）结果归属。

## Impact

影响 `projects/product/services/buildr-web/src/app/` 的菜单，以及 `src/features/code/` 的来源目录、切换和读取状态；后端仅调整 `projects/product/services/buildr/src/modules/code/` 的目录采集实现。沿用 Ant Design 5、现有超文本传输协议（HTTP）与 Git 写入校验，不新增依赖、数据迁移或发布动作。完成通知只用于来源读取更新，不新增跨工作空间（Workspace）的面向人消息；提交、推送和其他业务写入保持既有路径。
