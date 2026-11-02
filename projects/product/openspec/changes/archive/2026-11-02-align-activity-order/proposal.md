## Why

`4bd8c0e1f` 已把“所有对话”浮窗的排序改为按最近真实消息活动时间，但同一能力规范里浮窗那句仍写着“按用户最新输入”，与实现和列表排序句不一致。登记浏览器场景按旧措辞断言，`dev` 上 `e2e-browser:agent-conversations` 因此长期失败。

## What Changes

- 浮窗排序口径收敛为“最近真实消息活动时间”，与列表排序句一致；实现不变。
- 列表刷新保留已展开窗口的行为已有规范依据，修正仍按旧行为断言的浏览器场景。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 浮窗分组的组内排序按最近真实消息活动时间，不再表述为“用户最新输入”。

## Impact

只影响 `agent-conversations` 规范措辞与 buildr-web 的对话浏览器场景断言；不改排序实现、活动统计、待决策判定和列表分页行为。
