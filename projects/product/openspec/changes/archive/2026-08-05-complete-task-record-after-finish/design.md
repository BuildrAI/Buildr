## Context

Task Record、Task Finish 与 Task Environment 分别拥有独立事实：Task Record Application 是顶层状态唯一 writer，Task Finish 保存交付事实，Task Environment 保存 cleanup 事实。当前 Finish cleanup 的顺序是：写 `prepared` completion、委托 Environment cleanup、删除隔离 carrier、写 `complete` completion。该路径没有调用 Task Record Application，因此成功交付后 Task 仍可保持 `active`。

既有 terminal delivery projection 已采用 fail-closed 组合：只有 Task `completed/noChange=false`、Finish completion、handoff/Candidate/Content Target、remote readback、activation/Doctor 与 Environment cleanup 全部匹配才返回 `delivered`。本设计补齐缺失的顶层状态提交，不新增 store、writer 或聚合状态机。

## Goals / Non-Goals

**Goals:**

- Formal Finish 的全部交付与 cleanup 动作成功后，由 Task Record Application 原子提交 `completed/noChange=false`。
- blocked/failed 路径不提前改变顶层状态。
- resume 能幂等处理已经完成的 Task，同时拒绝 `noChange` 或 `abandoned` 冲突终态。
- Result operations 提供足以定位 Task Record 提交结果的有界 evidence。

**Non-Goals:**

- 不把 Finish 变成 Task Record writer，也不直接读写 SQLite。
- 不修改公开 `buildr task complete` CLI、Task Record schema 或 terminal projection schema。
- 不自动传播 Parent/Child 状态，不完成其他 Task。
- 不把 Task terminal state 写进 Finish completion 作为第二份 authority。

## Decisions

### 1. 在 cleanup 的最后可恢复边界调用 Task Record Application

Finish 先确认远端交付、Environment cleanup 和隔离 carrier cleanup 全部成功，再调用 Task Record Application。只有 Application 返回 `completed` 或确认既有 `completed/noChange=false`，Finish 才把 completion 从 `prepared` 写为 `complete`。

备选方案是在 `deliver` 后立即完成 Task；这会在 Environment 或 carrier cleanup 仍可能失败时过早暴露终态，因此不采用。备选方案是在 Finish completion 写成 `complete` 后再更新 Task；这会短暂产生“Finish complete 但 Task active”的旧缺口，也不采用。

### 2. 提供 Finish 专用的 Application 内部动作，不放宽公共 complete 语义

Task Record Application 增加内部方法，接收 Task ID 与确定性 Finish summary：

- `active`：事务写入 `completed`、`result.noChange=false`；
- `completed/noChange=false`：返回幂等成功且零 mutation effect；
- `completed/noChange=true` 或 `abandoned`：返回冲突并保留原记录；
- 数据库或引用异常：按现有 Task Record business error 返回 blocked。

公共 `completeTaskRecord` 继续保持 active-only、显式 summary/noChange 与 expected digest 规则，避免用户动作被静默改成幂等或接受终态覆盖。

备选方案是在 Finish 中先 inspect 再调用公共 complete 并捕获 terminal error；两次 Application 调用之间存在状态竞争，且把 Finish 特例散落在 consumer，因此不采用。

### 3. Finish completion 只引用 Application 结果，不复制 Task authority

cleanup phase operations 记录 `complete-task-record` 的 status、Task ID、`recordDigest` 与 effects；Finish completion 文件不复制 Task status/result。Local App 继续从 Task Record Application 与 Finish repository 各自读取权威事实并组合投影。

## Risks / Trade-offs

- [Task Record 提交失败时 Environment 与 carrier 已清理] → Finish 保持 `prepared/blocked`，resume 只需重试幂等 Task Record 提交与最终 completion 写入；测试覆盖该恢复边界。
- [Task 在 Finish 运行期间被人工改成冲突终态] → Application 原子检查当前状态；`noChange` 或 `abandoned` 不被覆盖，Finish 返回具体冲突诊断。
- [Task 已被人工正常完成] → `completed/noChange=false` 作为幂等成功，避免无意义失败；terminal projection 仍要求匹配 Finish facts才显示 delivered。
- [新增内部动作扩大 authority] → 动作仍位于唯一 Task Record Application，接口不公开为 CLI，输入和结果保持 closed，Finish 不接触 repository。

