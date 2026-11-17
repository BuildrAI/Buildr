## Why

后台命令等待时拒绝追加使用户不能干预长任务，需要立即消除该沟通空档。无破坏性接口变化。

## What Changes

- 在同一会话和执行身份内唤起提示处理后台等待期间的追加。
- 保留后台命令、原生受理判定和未知不重放边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `antigravity-cli-execution`: 后台等待期间允许追加并串行衔接自动续行。

## Impact

仅 Antigravity 执行器及协议回归；无需数据库迁移或新接口。
