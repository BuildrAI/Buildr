## Why

资源管理器需要随时查看实际工作树（Worktree），现有“本机目录/任务目录”无法独立选择，也无法组合查看多个代码库。任务完整文件跳转还可能忽略改动实际来源，导致看到不同版本。

## What Changes

- 增加真实工作树（Worktree）目录与任务关联分组的只读发现，代码库多选、工作树（Worktree）单选，两者双向联动。
- 代码库多选取并集，再与所选工作树（Worktree）组取交集；首次查看主目录；清空代码库表示全部实例，清空工作树（Worktree）恢复各实例主目录。同任务跨库成员使用一个组选项。
- 目录、搜索和文件阅读固定具体检出身份；不同组切换后已打开文件保持各自来源，失效来源显式诊断。
- 任务入口预选实际任务组；当前改动与完整文件跳转携带实际来源，历史文件继续固定提交（Commit）。
- 不增加依赖，不修改代码库登记，不自动创建工作树（Worktree）或切换分支（Branch）；新增输入为可选字段，兼容已有命令和请求，无破坏性变更。
- 补充任务工作树技能（Task Worktree Skill）的同任务跨库统一命名约定，Git 操作技能（Git Operations Skill）指向其创建职责；不修改能力契约（Capability Contract）或既有检出位置。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `repository-file-explorer`：联动筛选、具体位置身份与任务定位。
- `task-changes-workbench`：当前改动列表与完整差异读取保留实际来源。

## Impact

影响后端代码观察应用、只读命令行接口（CLI）和网页接口（API）、任务改动读取，以及前端资源管理器与任务文件导航。沿用现有Git工作树（Worktree）登记和任务提供者证据；不新增持久状态权威。
