## Why

DSH 右栏的新工具标签会先启动独立网页，经默认页面转跳后才显示目标工具。源代码管理列出仓库后，主要工作树的改动还会等同仓库其余工作树。

## What Changes

- 首次打开立即显示对应工具的加载状态，并在认证后直接进入目标工具。
- 源代码管理优先显示目标工作树已核验的改动，再补齐其他状态，保留既有身份与写入校验。

## Capabilities

### Modified Capabilities

- `harness-dsh-desktop-plugin`：打开右栏工具和反馈。
- `harness-directory-workbench`：分批交付工作树状态。

## Impact

DSH 桌面插件、Harness Web 入口与目录工作台读取。没有数据迁移或新增配置。
