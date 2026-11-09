## Why

专注对话模式下点击“对话列表”入口会把整个面板替换为历史视图，用户正在阅读的对话被打断，需要在列表与对话之间来回切换。专注模式拥有完整工作区宽度，列表应作为左侧临时栏浏览，而不是替换当前对话。

## What Changes

- 专注模式下对话列表以左侧临时列表栏打开：当前对话保持可见、不被替换；选择对话、点击“返回当前对话”或再次点击列表入口时关闭该栏。
- 分屏模式保持既有“历史在同一面板内替换显示、不新增并排历史栏”的行为。
- 修改 `buildr-web-client` 布局承诺，区分专注与分屏两种模式的历史呈现形态。
- 更新前端布局实现与浏览器场景断言，并校准代码地图中对话面板的职责描述。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`：对话历史在专注模式下的呈现由面板内替换改为左侧临时栏，分屏模式承诺保持不变。

## Impact

- `services/buildr-web/src/features/agent-conversations/ConversationPanel.tsx`、`ConversationActivity.tsx` 与对话停靠样式。
- `services/buildr-web/test/browser/agent-conversations-history-scenarios.ts` 场景断言。
- `knowledge/code-map/technical-layers.md` 对话面板描述。
- 不涉及数据接口、持久化、执行语义或移动端全局入口语义变化；非破坏性变更。
