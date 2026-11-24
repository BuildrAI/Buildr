## Why

资源管理器把跨仓库入口当成目录树，打平了实际文件层级，而且普通浏览要等待逐仓 Git 核对。

## What Changes

默认按已绑定工作空间的实际目录层级浏览；关联工作树保留为按需切换的来源。源代码管理仍按仓库组织。

## Capabilities

### Modified Capabilities
- `harness-directory-workbench`：区分默认目录和显式工作树来源。

## Impact

Harness 后端与共享前端工作台。无数据迁移，不扩大文件访问授权。
