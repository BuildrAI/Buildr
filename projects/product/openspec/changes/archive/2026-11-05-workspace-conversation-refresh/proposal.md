## Why
已合并并清理工作树的任务被误报为未明确服务范围；对话列表默认绑定业务空间，切换空间还会重建对话视图，妨碍独立阅读。

## What Changes
- 缺少任务工作树时只读核对关联提交是否已包含在主工作库当前 HEAD，逐库显示结果、未知与检查范围，不自动启动主库。
- 对话左上角列表入口默认全部工作空间。
- 工作区切换不重建对话及其挂载节点。
- 无破坏性变更。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `service-runtime-operations`: 无工作树时提供有界集成核对，不改变任务启动权限。
- `agent-conversations`: 列表入口默认全部工作空间。
- `independent-conversation-workspace`: 明确跨工作空间保持对话视图实例。

## Impact
服务运行只读详情、任务提交读取、前端应用壳与对话列表；不新增依赖、持久状态或外部写入。
