## Why

工具组限高滚动后，底部「收起工具调用」仍固定占一行，与组行本身的收起操作重复；执行中的组行还有一个与具体工具行几乎无差别的闪烁光点，列表标题和条目难以区分。

## What Changes

- 移除展开工具组底部的收起按钮：展开状态由工具组行自身切换。
- 移除组行前的执行光点，保留整行呼吸动画。
- 工具组行通过字重、颜色、间距和展开态分割线与组内具体工具行区分，不新增整行背景强调。
- 修订「执行过程必须自然平铺并保留失败提醒」中“底部收起操作必须保持可见”的要求。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 工具组收起改由组行承担，移除组内重复按钮；组行与组内工具行保持可辨识层级，且不使用整行背景强调。

## Impact

- `projects/product/services/buildr-web/src/features/agent-conversations/ConversationProcessBlock.tsx`
- `projects/product/services/buildr-web/src/features/agent-conversations/agent-conversations.css`
- `projects/product/services/buildr-web/src/features/agent-conversations/conversation-flow.css`
- `projects/product/services/buildr-web/test/conversation-process-render.test.mjs`
- `projects/product/services/buildr-web/test/browser/agent-conversations-history-scenarios.ts`
