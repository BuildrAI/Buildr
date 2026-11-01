## Why

执行中补充输入被误作新的展示轮次，导致智能体（Agent）展示行下移且整轮折叠遗漏补充内容。需要让界面边界与真实执行身份一致。

## What Changes

- 同执行补充归入原展示轮次，固定原输入和展示行位置。
- 整轮折叠包含补充图文，展开恢复原顺序，最终答复仍可见。
- 保留补充前后工具摘要的分段；不变更投递协议或历史数据，无数据破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 同轮补充的展示归属和整轮折叠边界。

## Impact

仅影响 Buildr Web 对话分组、折叠呈现与对应测试。后端执行、授权、分页和存储格式保持。
