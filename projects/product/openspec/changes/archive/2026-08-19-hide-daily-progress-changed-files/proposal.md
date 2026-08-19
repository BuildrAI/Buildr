## Why

每日演进按日视图把「变更文件」与四问、提交并列展示，路径清单噪音大、可读性差；读者更需要四问摘要与提交上下文。现在要把展示承诺从「必须展示变更文件」改为「不得展示」，并保留写入与只读 API 中的 `files`，方便 Agent 继续收集证据。

## What Changes

- Buildr Web 项目详情「每日演进」按日/按人视图不再渲染「变更文件」区块。
- 更新 `project-daily-progress` 与 `local-app-web-client` 中关于页面 MUST 展示变更文件的要求。
- 同步相关当前认知中的展示描述。
- **不**移除 YAML/`record` 的 `files` 字段，**不**改变 CLI inspect JSON 仍可返回 `files`，**不**改变「变更文件必须随提交一并保存」。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `project-daily-progress`: 项目页按日视图 MUST NOT 展示变更文件列表；仍 MUST 展示四问与提交。
- `local-app-web-client`: 每日演进视图 MUST 列出四问与提交，MUST NOT 列出变更文件。

## Impact

- `projects/product/services/buildr-web`：`DailyProgressPanel` 及样式（若有）。
- OpenSpec canonical：`project-daily-progress`、`local-app-web-client`。
- 当前认知：`knowledge/services/buildr-web.md`、`knowledge/flows/project-daily-progress.md`、`knowledge/architecture/technical.md` 等展示表述。
- HTTP/CLI/Application 存储契约保持兼容；已有含 `files` 的 v2 文件仍可读。
