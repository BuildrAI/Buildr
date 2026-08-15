## Why

任务已经放弃，正式收尾却还占着隔离载体（Delivery Carrier）。环境清理只收任务工位，自举协调器又不准代为关门，产品也没有「注销这张收尾单占用」的入口。后继收尾和自举会一直被挡住。像退房了但房卡还开着门禁，前台没有注销按钮，下一间房的入住系统就一直报占用。来源是已完成任务 `deliver-finish-preflight-bind-order` 的复盘。

## What Changes

- 在既有 `task finish run` 上增加 `--release-occupancy`：任务已放弃、且该收尾单从未成功交付到远端时，释放其隔离载体占用。不新增第三套 Finish action，不把已放弃任务改成完成，也不拿过时载体去推远端。
- 自举 closeout 对这类可证明的外载体给出原 owner 命令，不再只标人工审查却要求「目录自己消失」。
- Agent 在放弃任务并清理环境后，若仍有未交付的 Finish 占用，必须调用该产品入口，不得手删载体目录。
- 不做：不跳过已成功 push 的交付；不让 closeout 协调器删除别人的载体；不把放弃动作直接改写成 Finish 内部副作用。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `task-finish-execution`：增加放弃后、未交付占用的释放动作、授权与终态，不得完成 Task Record。
- `task-closeout-orchestration`：abandoned + 未交付 + 仍占载体时，恢复计划给出确定性 owner 命令。
- `agent-task-workflows`：放弃后若占用仍在，Agent 走产品入口而不是手删目录。
- `cli-product-surface`：既有 `task finish run` 增加 `--release-occupancy`，仍只有 run/inspect 两套 action。

## Impact

- 代码：Task Finish Application/executor、carrier 清理、CLI registry、自举 closeout runner 分类、`task-finish` Skill。
- 测试：放弃后释放占用、已交付拒绝释放、closeout 对可证明 predecessor 给出 owner 命令、禁止协调器删除。
- 不改 Finish 正常五阶段成功路径，不改 Task Record 终态不可重开。
