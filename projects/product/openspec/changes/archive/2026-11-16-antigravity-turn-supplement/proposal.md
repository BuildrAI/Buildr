# Antigravity 执行中追加输入

## Why

Buildr 的统一对话已支持在执行中追加输入，但 Antigravity 执行器把 `supplement` 能力声明为 `false`，用户在 Antigravity 执行中发送时只会看到“当前接入尚不支持执行中发送，输入已保留”。

原生 `agy acp` 1.5.8 已支持通过再发送一个 `session/prompt` 引导（steer）当前回合。实测还发现一个关键差异：追加提交后，原 `session/prompt` 会立即以 `end_turn` 返回，但原生回合并未结束；追加请求会一直持有回合直到真正结束。若直接启用能力而不调整回合状态管理，Buildr 会在追加后把原轮误判为完成并丢失后续输出。

## What Changes

- Antigravity 执行器声明支持执行中追加，并在同一 `agy acp` 会话发送追加 `session/prompt`。
- 回合状态改为提示链：只有当前最新的提示回执或原生完成记录可以结束回合，被追加取代的原提示提前返回不再结束回合。
- 追加输入写入 Buildr 会话记录并携带 `clientRequestId`，支持历史读取与回执核对。
- 待回答问题或授权、正在停止、回合已结束或仅后台工作运行时拒绝追加，保留输入。
- 补齐 ACP 夹具与集成测试，覆盖追加受理、提示链完成、拒绝条件、多次追加与停止。

## Impact

- 能力：`antigravity-cli-execution`。
- 不新增前端交互、命令或配置字段；统一对话的现有追加入口在能力开启后即可使用。
- 不改变 Antigravity 原生程序、账号、权限模式或后台续行语义。
