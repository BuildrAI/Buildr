## Why

foreign carrier 清除后的唯一自举重试会先快进到最新 `dev`，但并行交付可能使原 Finish run 随即命中 `task-finish.target-race`。当前 runner 在这里把可恢复状态统一报成 incomplete，导致 Agent 只能请求一次流程外例外，无法按既有 target-race 机制继续同一 run。

## What Changes

- 仅在 `--retry-after-foreign-clear true` 的有界重试中，runner 识别精确的同 run `target-race` Result，并使用该 Result 的 matching resume token 再承接一次既有 Task Finish 恢复。
- 第二次恢复若可机械完成则正常收敛；若进入 Delivery Adaptation，则保留 carrier 与 exact token，明确交给 Agent 审核适配，Agent 无法安全处理时再请求用户授权。
- 其他 blocked、identity 漂移、再次 target-race 或适配后的继续执行均不自动循环；不新增队列、状态存储或通用重试框架。
- 无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-closeout-orchestration`：补充 foreign-clear 唯一重试与同一 Finish run target-race 连续发生时的有界恢复和 Agent 交接要求。

## Impact

- `buildr-self-bootstrap-sync` runner、Skill 与自举 Component contribution。
- Buildr self-bootstrap closeout integration tests。
- `task-closeout-orchestration` 规范及相关 current knowledge。
- 不改变普通 Workspace、Task Finish 的 target-race Domain 机制或 npm 用户包内容。
