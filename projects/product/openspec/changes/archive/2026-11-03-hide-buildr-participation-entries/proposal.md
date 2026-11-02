## Why

用户要求暂时隐藏两个 Buildr 参与查看入口，保留采集及查询，之后可恢复。

## What Changes

- 单次明细和汇总入口统一默认隐藏，隐藏时不挂载内部面板、不发起参与查询。
- 保留后台、组件、原证据导航与查询接口；不新增设置、权限或模型调用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-buildr-participation`: 两个入口允许统一临时隐藏，查看能力及数据不删除。

## Impact

仅前端组件入口、浏览器回归与对应规范；不改变数据和API。
