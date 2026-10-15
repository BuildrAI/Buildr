## Why

源代码管理中常驻的分支（Branch）、短提交标识及日期挤占名称与标题宽度，而这些信息已能通过悬停摘要和右侧详情读取。按用户最新决定精简两类列表，减少重复信息并改善窄栏阅读。

## What Changes

- 工作树（Worktree）列表仅常驻名称、远程状态、未提交文件数及任务（Task）入口；真实分支（Branch）或游离提交（Detached HEAD）转入现有可选择复制的悬停层（Hover Card）。
- 提交历史（Commit History）列表仅常驻标题、引用与任务（Task）图标以及展开操作；完整提交标识和时间保留在悬停摘要及右侧详情。
- 释放名称与标题宽度，保留主来源与子来源的状态列对齐及真实身份选择。此变更没有接口或数据兼容性破坏；只替换现有常驻列的呈现承诺。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `code-source-control`：来源分支（Branch）及提交（Commit）标识、时间按需呈现，保留选择身份、悬停操作和固定版本读取。
- `buildr-web-client`：源代码管理来源列表使用名称和状态，分支（Branch）由现有信息层表达。

## Impact

修改 `projects/product/services/buildr-web/src/features/code/components/SourceControlRepositories.tsx`、`SourceControlHistory.tsx` 及局部样式，调整现有 `test/browser/source-control-journey.ts` 的呈现断言与完整提交身份定位。复用正式页面和现有原型的共享组件，不新增原型、依赖、协议、数据迁移或后台读取。当前知识中的职责和读取边界仍适用，无需重建地图或技术图。
