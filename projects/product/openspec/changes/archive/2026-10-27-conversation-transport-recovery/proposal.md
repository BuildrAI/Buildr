## Why

原生执行连接断开后，宿主仍运行时不会进入既有启动恢复；失效连接还可能长期被复用。对话因此持续锁定，需要自动核对并安全接续。无破坏性变更。

## What Changes

- 重建已确认关闭的原生连接，保留原绑定与会话，先观察不重发。
- 开发版对已受理的系统连接中断至多续做一次；用户主动停止、未知工具和待决定事项禁止自动续做。
- 存量未知执行自动核对终态，缺少中断来源时不自动续做。
- 提供准确中断原因。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：补充宿主存活时的原生连接中断恢复。

## Impact

影响智能体服务（Agent Service）的连接生命周期、执行恢复和回归检查；不增加依赖，不改变正式版自动续做政策。任务说明见 [任务说明](@task/conversation-transport-recovery)。
