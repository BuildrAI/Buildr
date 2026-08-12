## Context

现有 Task Finish 已定义正确的 provider 分层和大致顺序，但执行计划、成功副作用与 evidence chain 没有产品级 checkpoint。Skill 超过百行且依赖 Agent 在单个 context window 中记住全部状态。Codex App 又不能把任意既有 Buildr worktree 绑定为新 task，因此产品必须把“逻辑任务身份”和“执行 session”解耦，而不能伪造 worktree adoption。

## Goals / Non-Goals

**Goals:**

- 用持久化 run 表达收尾 DAG、状态、证据、effects、失效与恢复。
- 在相同输入下保证 advance/resume 幂等，避免重复 push、验证和 cleanup 前动作。
- 支持多个任务并发收尾，仅为真实共享资源使用短 lease。
- 让 Skill 只负责意图、授权与调用 CLI/provider，不复制专业 provider 正文。

**Non-Goals:**

- 不在 Buildr 内实现 Agent 推理、Git provider、验证 provider 或 Codex thread/worktree 管理器。
- 不声称 Codex-managed worktree 已采用任意 Buildr worktree，也不声称 Buildr 当前能自动 handoff Agent host。后台 session 只是可选载体。
- 不自动 force push、解决语义冲突或删除用户保留环境。

## Decisions

### 1. Run 是逻辑任务的持久执行实例

状态写入 `<workspace>/.buildr/task-finish/runs/<run-id>.json`。run 固定 task、change、target branch、remote 和 plan version；session history 只作为 append-only execution carrier evidence，不参与 identity。`inspect` 返回当前步骤、已完成 effects、有效 evidence、阻塞、stale steps 和 next action。

### 2. 固定骨架，provider action 作为 step effect

V1 使用稳定顺序：context/current knowledge → managed assets/OpenSpec convergence → candidate commit/target convergence/runtime → formal assurance → asset review/archive → integration/push → runtime install/cleanup。每步保存 `inputFingerprint`、`effects`、`evidence`、`invalidates`、`retryPolicy`。CLI 不替 provider 做语义判断；`advance` 领取当前 action，Agent/provider 执行后用结果推进 checkpoint。

### 3. 精确失效而非整轮重跑

resume 比较步骤当前 fingerprint。变化步骤标记 stale，并沿显式依赖传播；passed 且 fingerprint 未变的步骤保持 passed。push 已 passed 后 cleanup blocked，只恢复 cleanup。最终树 identity 是 formal assurance 的输入，因此 rebase/runtime/canonical 变化只使 assurance 及其下游 stale。

### 4. 独立 run 与短 lease

run 文件互不共享锁。只有标记了 `sharedResource` 的步骤在进入 running 时创建带 owner、token、expiry 的 lease；完成或阻塞即释放。过期 lease 可被新 attempt 接管。远端 target ref 记录 expected observation，集成前重新比较；不匹配以 `target-race` 阻塞并失效 target convergence 下游。

### 5. CLI 是 checkpoint API，不是第二个 Agent

`advance` 创建或领取下一步，并可提交 passed/blocked 结果；`resume` 先重算 stale/blocked 恢复边界再领取下一步；`inspect` 只读。JSON 是稳定接口，文本输出面向 Agent。未来可由 Local App/Codex connector 自动 handoff，但 V1 不绑定某一 Agent 产品 API。

### 6. Execution readiness 不绑定 session root

普通 execution readiness 只核对 environment receipt、repository membership/identity、allowed execution roots、checkout-local CLI/runtime projection identity 和明确 target/workdir。原对话可从 canonical Workspace 启动并持续操作 task environment。只有 Rules、Skills 或 runtime adapter 变更且验收要求激活证据时，才进入 adapter-specific activation verification；Buildr 当前只保存 agent-attested evidence，不内省或自动启动 Codex host。

## Risks / Trade-offs

- 固定步骤骨架无法覆盖所有 Project 细节：步骤 action 只声明 capability/intent，实际 provider 仍按 binding 和 Project policy执行。
- lease 文件可能因进程退出遗留：expiry 与 token ownership 允许安全恢复，不使用 Workspace 全局锁。
- checkpoint 可能被错误提交：CLI 校验 attempt、当前状态与 fingerprint；不匹配 fail closed。

## Migration Plan

1. 增加新状态机、CLI 与行为测试，不迁移历史 session-only 状态。
2. 精简 Task Finish Skill 与 contract，使新任务默认创建 finish run。
3. 同步 package/runtime assets；既有进行中收尾可继续旧流程，新 `advance` 从显式 task/run 开始。
4. 若实现需要回退，可保留 run 文件并恢复旧 Skill 版本；run JSON 不影响其他 Buildr 命令。
