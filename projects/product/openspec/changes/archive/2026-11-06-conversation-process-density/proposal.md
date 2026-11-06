## Why

对话信息流把模型思考渲染成一条条「思考 N 字」折叠块，夹在工具调用与说明之间。用户看不到过程重点，长会话还会被大量思考条目占满；同一规范里也存在互相矛盾的表述——一处要求思考折叠展示，另一处要求思考不得作为处理过程节点。

另外，展开一个包含几十上百条调用的工具组时，组内容随条目无限增高，会把整屏占满，反而看不到其它内容。

## What Changes

- 对话信息流不再展示模型思考：不出现思考节点、规模提示或思考正文；旧版带 `thinking` 标记的条目同样跳过。
- 思考条目的数据投影、最终答复判定、工具计数与失败统计语义保持不变。
- 展开的工具组限制最大高度，条目超出时在组内滚动，底部「收起工具调用」保持可见。
- 修正规范中“思考默认折叠、展开显示原文”的过时要求，与既有“思考不得作为处理过程节点”对齐。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 模型思考从可见信息流中移除，只保留数据与判定语义；展开的工具组增加限高与组内滚动。

## Impact

- `projects/product/services/buildr-web/src/features/agent-conversations/ConversationProcessBlock.tsx`
- `projects/product/services/buildr-web/src/features/agent-conversations/agent-conversations.css`
- `projects/product/services/buildr-web/test/conversation-process-render.test.mjs`
- 不改变接口、数据格式与依赖。
