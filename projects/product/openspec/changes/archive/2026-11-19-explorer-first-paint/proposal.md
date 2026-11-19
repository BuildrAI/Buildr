## Why

对话内文件链接在校验正文之前会枚举全量代码库和工作树，首次阅读仍被秒级清单挡住。目录和正文应能独立出现。

## What Changes

- 对话链接先查询目标路径的精确来源，沿用现有正文与版本检查。完整目录选择列表后台补全。
- 保留既有清单查询、路径隔离、歧义失败和已打开文件的刷新语义，无破坏性变更。

## Capabilities

### Modified Capabilities

- `repository-file-explorer`：明确目标文件定位和正文不等待全量清单。

## Impact

Buildr Web 和本机只读代码接口；不改写业务文件或 Git。
