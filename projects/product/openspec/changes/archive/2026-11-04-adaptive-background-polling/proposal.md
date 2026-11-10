## Why

4458稳定状态仍每五秒读取服务和活动、每分钟核对版本。用户授权降低重复请求，保留执行期间及时观察；无破坏性变更。

## What Changes

- 空闲活动和稳定服务三十秒，活动或启动中五秒；隐藏暂停恢复补读。
- 版本感知十分钟，更新作业仍一至两秒。
- 自动请求串行，短期焦点合并，操作和手动刷新及时。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`: 活动与可见性驱动后台观察。

## Impact

前端三个功能及测试；不改变API、执行状态、数据或依赖，单次Git耗时不在范围。
