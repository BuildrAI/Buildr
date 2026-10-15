# 源代码管理列表按需呈现元信息

[任务说明](@task/source-control-list-simplify)

本变更把来源分支（Branch）、历史短提交标识和日期从常驻列表移入已有信息层，给名称与标题留出空间。真实工作树（Worktree）和完整提交（Commit）身份、状态列、任务（Task）入口、悬停复制及右侧详情保持。

只调整前端呈现及两类已有规范条目，不修改后端读取、图片比较、任务关联规则或历史数据。验收关注列表精简、正常与窄分屏对齐、按需信息仍完整，以及同标题提交（Commit）按真实身份分别选择。

方案见 [proposal.md](proposal.md)，取舍见 [design.md](design.md)，直接实施及验证见 [tasks.md](tasks.md)。
