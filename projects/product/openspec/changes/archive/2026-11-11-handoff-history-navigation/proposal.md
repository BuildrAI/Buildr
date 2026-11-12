## Why

真实交接索引达到 713 KB，现有提示要求先读取索引，撞上 Qoder 256 KB 文件读取上限。796 条历史中 618 条为工具元数据，消息读取不应被这些条目挤占。任务说明见 [任务说明](@task/handoff-history-navigation)。

## What Changes

- 使用轻量轮次目录及可直接使用的 history 参数，不要求 Agent 整文件读取内部索引。
- 历史查询新增可选 `view: messages`，过滤工具元数据，保留用户要求、纠正、可见说明、答复和通知的原始顺序；省略时仍返回原有全部可见条目。
- 保留索引格式、来源覆盖、修订校验、原生详情读取和旧回执兼容。无破坏性变更，不新增依赖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：增加交接的轻量导航及消息优先读取约束。

## Impact

影响 buildr-agent 及 Buildr 宿主 HTTP 历史入口的参数透传；交接提示、来源查询、操作 schema、控制命令说明和现有测试；校准 knowledge/docs/architecture/agent-integration.md 的相关说明。不改变网页默认读取、存储回收和运行控制。
