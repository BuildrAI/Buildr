## Why
4458 的重启交接在旧实例退出超时后放弃，新实例未启动、旧实例随后退出，导致服务断档。用户还需要明确重启独立 Agent 执行服务。

## What Changes
- 有界排空 Web 长连接，停止接收新请求后完成资源释放与实例交接。
- 增加独立“重启 Agent 执行服务”入口，核对已观察代次、所有活跃实例忙闲及准确退出确认，再重新连接。
- 保持现有 Web 重启不强停 Agent 的兼容行为；两种入口明确区分，不重放历史操作。
- 无破坏性变更。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `buildr-web-client`: 增加独立执行服务重启与错误反馈。

## Impact
涉及 buildr 的HTTP宿主退出、agent-service装配与接口，buildr-agent 进程生命周期公开能力，buildr-web 菜单与客户端；无新依赖或存储格式变化。
