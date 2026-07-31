## Context

Buildr 的验证步骤通过 detached process group 启动直接子进程，并把 stdout/stderr 管道交给执行器收集。当前 `runVerificationStep` 只在 child `close` 事件中执行后代追踪清理和 Promise settle；当直接子进程已经退出、某个后代仍继承并持有 stdio 时，`close` 不会到达，清理逻辑也永远不会运行。上层 DAG 已经收到各检查写出的诊断，却无法从 `executePlan` 返回，因此 `changed.mjs` 不能写出 timing summary。

本 Change 先修复 `dev` 上的验证执行基础设施。依赖本修复的 `harden-task-finish-identity-timing` 将在 rebase 后处理其自身新引入的 formal-assurance 非通过 summary 校验，避免在本 Change 中复制未集成候选代码。

## Goals / Non-Goals

**Goals:**

- 直接子进程退出后立即进入受控收敛：停止 lineage sampling，精确终止当前 step 已观察到的 process group/descendants，并等待 stdio 在有界时间内关闭。
- `close` 正常到达时保留完整输出；超过 grace period 时仍让 step 以失败终态返回，并写出 process cleanup 与 close-timeout 诊断。
- 让上层 DAG 和 `changed|candidate` 入口无论 step 成功或收敛失败都能继续生成统一 timing summary。
- 保持清理只作用于当前 step 创建的 process group 和观察到的后代，不扫描、终止或释放其他 verification run。
- 让验证 fixture 自己启动的 task preview 在受认证 stop 完成后真实退出，避免短暂 reparent 窗口逃过 lineage sampling。

**Non-Goals:**

- 不改变验证 capability 选择、并发资源容量或测试预算。
- 不把失败或不完整验证视为通过。
- 不在本 Change 修改尚未集成的 identity/timing formal-assurance 校验。
- 不引入通用进程管理器或跨任务调度器。

## Decisions

### 1. 将 `exit` 与 `close` 分为两个生命周期信号

直接子进程的 `exit` 表示命令主体已终止，是开始 owned cleanup 的最早可靠边界；`close` 表示 stdio 已关闭，是保留完整输出的正常 settle 边界。执行器在 `exit` 时记录 exit identity并执行一次幂等清理，在 `close` 时正常完成。

备选方案是继续只监听 `close`，但这正是当前死锁来源；在 `exit` 立即 resolve 又可能丢失仍在管道中的输出，因此不采用。

### 2. 为 exit-to-close 增加短且可配置的 grace period

清理后等待一个有限 grace period 让管道自然关闭；超时则返回 failed result，诊断代码明确为 `process-close-timeout`，同时保留已收集 stdout/stderr、退出信号、process cleanup 结果和真实 duration。测试通过 runtime 注入 timer/grace，不依赖真实长等待。

备选方案是为整个 capability 统一增加固定总超时，但这会把测试预算、资源等待和进程生命周期混为一谈。本 Change 只封住“child 已退出但 close 不到达”的确定性缺口。

### 3. 清理幂等且只绑定当前 runner ownership

`exit`、`close`、`error` 和 timeout 可能竞态到达。实现使用单独的 cleanup/settle 状态，确保 lineage tracker、process group cleanup、descendant cleanup和 timer 只执行一次；重复事件只补充输出或被忽略。ownership 仍来自 spawn 时创建的 process group和采样到的 parent-child lineage。

备选方案是按进程名或全局 `ps` 结果清理，无法证明 task/run ownership，会误伤并发任务，因此禁止。

### 4. summary 由现有顶层 finally/catch 路径统一生成

本 Change 不新增第二种 summary schema。runner 总能 settle 后，现有 `changed.mjs`/`candidate.mjs` 使用 `buildr.verification-timing/v1` 写出 `passed|failed` summary；close timeout 作为 step failure进入 results。若顶层异常，仍由现有 catch 写失败 summary。

### 5. Preview owner 在受认证 shutdown callback 中终止自身进程

`buildr app preview stop` 已通过 preview secret 和独立 data root 认证目标实例。Preview server close callback 清理 instance record 后，preview 进程必须显式退出；默认 Local App 不使用该分支。这样修复真实 owner 的生命周期，而不是让 verification runner 按进程名猜测和清理漏采样的 orphan。

## Risks / Trade-offs

- [Risk] grace period 太短可能把极慢的 stdio flush 判为失败 → 默认值只作用于 direct child 已退出后的异常窗口，并允许测试/runtime 注入；正常 close 通常立即到达。
- [Risk] `exit` 与 `close` 同时到达导致重复 kill 或丢输出 → cleanup 与 settle 分离并幂等，正常 `close` 优先保留完整输出。
- [Risk] process group 已不存在但采样 descendants 仍存活 → 同时保留 group cleanup 与 tracked descendants cleanup，两者分别记录结果。
- [Risk] 清理失败后 summary 仍生成 → step 必须是 failed，不允许 process cleanup warning 被当作通过，但 summary 本身仍是可信失败证据。
- [Risk] preview 显式退出误伤默认 Local App → 只在进程携带已解析的 `previewIdentity` 时执行，默认实例继续沿用现有 shutdown 行为。
