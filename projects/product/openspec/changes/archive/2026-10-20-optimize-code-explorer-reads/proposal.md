## Why

资源管理器把多个代码库的目录合为一个工作树（Worktree）选项，无法逐项选择真实目录。普通文本先后读取阅读与编辑正文，刷新还遍历所有已加载目录，增加可避免的等待。

## What Changes

- 保留代码库多选；仅一个具体代码库时启用实际工作树（Worktree）单选。
- 当前完整文本直接使用一次编辑快照满足阅读和编辑；图片、历史、大文件继续使用原有有界读取。
- 刷新目录仅更新当前展开范围，收起目录下次展开重新读取；文件提供独立刷新。
- 不改变保存授权、来源身份、冲突保护和外部写入边界。既有命令行接口（CLI）与网页接口（API）兼容，无破坏性协议变化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `repository-file-explorer`：具体目录选择、按层读取与局部刷新。

## Impact

主要影响 `services/buildr-web/src/features/code/`、共享文件浏览及阅读组件（Component），复用既有 `editor-file`、`directory` 与 `file`。无需新增依赖、接口或修改智能体（Agent）的文件能力；长期知识未发现需要本次新建的内容。
