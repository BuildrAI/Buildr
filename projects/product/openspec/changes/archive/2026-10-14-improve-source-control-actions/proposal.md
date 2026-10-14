## Why

当前源代码管理（Source Control）将分支（Branch）名称固定在行末，挤占状态和任务（Task）图标空间，分支（Branch）操作与获取远程（Fetch）也混在同一浮层。现在需要按用户提出的日常操作顺序整理入口，并提供明确来源、可核对阶段结果的同步（Sync），减少反复寻找操作和手工拉取、推送。

本轮任务说明见[任务说明](@task/source-control-actions)。本变更不包含破坏性数据迁移或既有接口删除。

## What Changes

- 调换代码侧栏导航位置，源代码管理（Source Control）在前、资源管理器（Explorer）在后。
- 将当前分支（Branch）名称放在来源名称后，点击名称打开既有检出（Checkout）与切换浮层（Popover）；状态、任务（Task）和末尾操作保留可达空间。
- 将来源行末向下箭头改为三个点操作菜单（Menu）；单库获取远程（Fetch）移入该菜单，全部获取远程（Fetch）移入目录标题操作菜单（Menu），只读刷新继续独立。
- 新增针对具体工作树（Worktree）的同步（Sync）：固定当前已跟踪上游（Upstream），获取对应远程引用（Ref），需要时快进（Fast-forward）或对相对固定上游（Upstream）尚未推送的提交（Commit）执行变基（Rebase），成功后普通精确推送（Push）。非零上下箭头及数量提供同一同步（Sync）快捷入口，文件状态仍独立查看详情。
- 分阶段表达获取、整合与推送的真实效果；整合冲突保留现场并停止推送，不自动临时保存（Stash）、强推或建立上游（Upstream）。完成后复用按代码库（Repository）局部重新观察。

## Capabilities

### New Capabilities

- `code-worktree-sync`：绑定具体工作树（Worktree）和已观察版本的显式同步（Sync）、安全整合、固定目标普通推送（Push）及部分成功反馈。

### Modified Capabilities

- `code-source-control`：导航顺序、来源名称后可点击分支（Branch）入口、独立行末操作菜单（Menu）与宽窄布局。
- `code-remote-fetch`：将单库及全部获取远程（Fetch）入口移入相应操作菜单（Menu），保持局部结果和重新观察语义。

## Impact

- 前端：`projects/product/services/buildr-web/src/app/AppNavigation.tsx` 与 `features/code/` 中来源目录、分支（Branch）管理、业务请求、结果展示及样式。
- 后端：`projects/product/services/buildr/src/modules/code/` 新增同步（Sync）应用和 Git 基础设施，复用来源身份、获取引用（Ref）、普通推送（Push）与同源会话（Session）授权；增加对应超文本传输协议（HTTP）读写契约和生成类型。
- 检查：使用临时本地远端验证不同提交（Commit）关系、冲突、配置与身份漂移、部分成功及并发，浏览器（Browser）验收菜单（Menu）、浮层（Popover）和窄栏。
- 当前知识：`knowledge/code-map/system-services-assets.md` 的代码能力说明可能需补充同步（Sync）入口；本轮仅评估，未取得知识维护授权前不修改。既有技术分层说明、只读命令行接口（CLI）边界和已知限制保持适用。
