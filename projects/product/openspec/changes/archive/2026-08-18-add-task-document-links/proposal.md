## Why

Task 详情目前把 Intent 作为纯文本展示，用户即使知道任务参考了某个 Workspace 文档，也无法从任务页面直接打开查看。父任务推进时，重要架构文档因此与任务上下文脱节，用户只能依赖记忆或手工查找路径。

## What Changes

- Task Intent 支持以普通 Markdown 链接呈现已登记 Project 内的 `.md` 文档。
- 用户点击文档链接后，在 Buildr Web 内打开只读预览，并展示文档名称与 Project 相对路径。
- 非文档相对链接、越界路径、缺失文件继续安全失败，不获得任意 Workspace 文件读取能力。
- 当前父任务的 Intent 增加对 `service-architecture.md` 的可点击引用。
- 不新增附件表、文档状态、Planning gate 或 Task 生命周期字段；不是破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `local-app-web-client`: Task 详情从纯文本 Intent 扩展为安全 Markdown 文档引用，并复用 Project 文档只读能力打开预览。

## Impact

- Buildr Web Task 详情、Markdown 链接解析和文档预览交互。
- Local App Web 客户端契约、浏览器与集成测试。
- `buildr` 消费的 `web-dist` 构建产物。
- 当前父任务 `reorganize-buildr-service-architecture` 的顶层 Intent 元数据。
