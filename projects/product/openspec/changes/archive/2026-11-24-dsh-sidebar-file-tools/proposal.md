## Why

DSH 窄右栏的工具标签容易截断，文件区的工作树选择也没有与搜索和操作栏对齐。

## What Changes

打开后的 DSH 标签使用「文件」「代码库」，开始页保留全名。浏览来源控件并入文件区，不改变文件默认范围或工作树加载策略。无数据迁移。

## Capabilities

### Modified Capabilities
- `harness-dsh-desktop-plugin`：区分入口全称与标签简称。

## Impact

DSH 插件、Harness 文件区及相关验证；不改变任何 Git 或文件权限。
