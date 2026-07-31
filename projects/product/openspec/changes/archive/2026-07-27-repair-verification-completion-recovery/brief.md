# 修复验证执行收敛与失败摘要

## 一句话摘要

让 Buildr 正式验证在直接子进程退出但后代仍占用 stdio 等异常场景下有界结束，并始终生成可诊断、可消费的非通过 summary。

## 背景与问题

真实 Task Finish 收尾中，受影响验证的全部 capability 已写出通过诊断，但验证顶层进程在直接子进程消失后仍持续运行，最终没有生成 `timing.json`。代码核对表明 runner 只在 child `close` 事件后执行 owned descendant cleanup；后代继承 stdout/stderr 时，`close` 等待后代、cleanup 又等待 `close`，形成生命周期死锁。

## 目标与非目标

目标是把 child `exit`、owned cleanup、stdio `close` 和 Promise settle 分离，设置有界 exit-to-close grace period，并让上层 verification execution 在异常路径仍写出 `failed|incomplete` summary。非目标是改变验证范围、预算、资源容量、通过门槛，或引入通用进程管理器。

## 受影响用户或角色

- 使用 Task Finish 的 Agent：不会因 verifier 无 summary 而永久悬挂在 formal-assurance。
- 并发开发 Buildr 的维护者：异常 run 只清理自身 process group/observed descendants，不误伤其他任务。
- 审查验证证据的用户：失败时仍能看到主失败、真实 wall-clock、进程 ownership 和恢复动作。

## 核心流程

Runner 启动 detached child 并追踪后代；child `exit` 后立即停止 lineage sampling并执行一次 owned cleanup，然后等待 stdio `close`。正常 close 使用真实 exit code和完整输出 settle；超过 grace period则以稳定 close-timeout 失败 settle。DAG 收到终态后继续汇总，顶层入口写出统一 timing summary。

## 关键变化

- child `exit` 与 stdio `close` 分离处理。
- owned cleanup 与 settle 幂等化。
- exit-to-close 增加可配置、有界 grace period。
- close timeout、cleanup failure和其他检查结果进入同一 verification summary。
- task preview 在受认证 stop 的 server close callback 中真实退出，不留下 PID 1 orphan。

## 影响、风险与兼容性

验证 capability 选择和 summary schema 保持兼容。异常 stdio flush 可能被新的 grace period判为失败，但不会再无限悬挂；默认窗口只在直接子进程已经退出后生效。清理继续严格绑定当前 runner ownership。

## 验收摘要

- 后代持有 stdio 时 step 在有界时间内结束且不误伤其他 run。
- exit/close/error/timeout 竞态只清理、settle一次。
- close timeout或cleanup failure产生非通过 step result。
- fast integration 成功后不残留 task-owned preview process。
- changed verification仍写出当前 run/candidate绑定的非通过 timing summary。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-verification/spec.md`
- `tasks.md`
