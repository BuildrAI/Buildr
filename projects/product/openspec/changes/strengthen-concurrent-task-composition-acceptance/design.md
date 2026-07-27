## Context

现有 `concurrent-task-acceptance` 已在临时 Workspace 中创建两个任务环境，验证双预览共存、容量为一的资源排队、`target-race` 和最终 doctor。但它只断言 CLI invocation 是绝对路径，没有执行该入口；临时 Workspace 只有一个 Git 仓库；预览顺序启动；worktree 和分支由脚本直接调用 Git 删除；收尾只调用状态机原语；worker 输出在关闭事件附近存在竞态窗口。

本 Change 只增强 Candidate 的组合证明，不重新设计任务环境、Local App、验证资源协调或 Task Finish。

## Goals / Non-Goals

**Goals:**

- 让每项组合验收声明都对应真实的产品入口和可核对证据。
- 在一个可重复场景中覆盖双任务、多仓、不同 cwd、并发启动、资源协调、竞态恢复及安全清理。
- 让子进程异常具有稳定诊断，消除输出收集时序造成的偶发失败。
- 保持 Candidate required gate 的运行时间和清理可控。

**Non-Goals:**

- 不增加新的任务隔离层或 OS 沙箱。
- 不改变现有 CLI、预览、资源租约和收尾的公开语义。
- 不在本 Change 解决 CLI 源码变化后的 identity 自动刷新，也不重构收尾 provider evidence 输入。
- 不要求真实浏览器参与此组合门禁；用户界面继续由 browser smoke 覆盖。

## Decisions

### 1. 使用最小真实多仓 fixture

临时 Workspace 将登记一个入口仓库和一个嵌套独立仓库，再为两个任务创建相同 repository plan。这样能证明 canonical nested checkout、membership 和 allowed roots，而无需复制生产 Workspace 的全部规模。

替代方案是继续使用单仓 fixture 并为多仓保留单元测试；它不能证明多仓与 CLI、预览、清理组合后的边界，因此不采用。

### 2. 从多个 cwd 执行 receipt 原样返回的 invocation

验收直接消费 `cliInvocation.command` 和参数前缀，分别从 Workspace、Product 与嵌套 Service cwd 执行只读 context/identity 命令，并核对输出属于预期任务。验收不自行重算相对路径。

替代方案是只检查绝对路径及 identity 字段；这只能证明结构，不能证明入口实际可用，因此不采用。

### 3. 并发启动使用明确的就绪屏障

两个预览和可并行 worker 先创建进程，再等待各自的结构化 ready evidence；共享容量 worker 继续通过租约证明排队。所有子进程由统一 supervisor 收集终态并登记 owner。

替代方案是 Promise 同时发起后只检查最终结果；这会掩盖实际未重叠运行和退出时序问题，因此不采用。

### 4. 清理只调用产品生命周期入口

新增 `buildr worktree cleanup <task-id> --agent <agent> --target <workspace> --integrated-ref <selector>=<ref>...`，成功和注入失败两条路径都调用 Buildr 的 preview/resource/worktree/finish 清理动作。该命令从共享 Git metadata 读取 receipt，逐仓核对 owner、checkout、branch、clean、integrated ref 与其他 worktree ownership，按最深 nested checkout 到 root 删除 worktree，再删除已证明集成的本地任务分支、adoption receipt 和 environment receipt。任一成员不满足条件时在写入前整体阻塞。

命令不接受通用 `--force`，不删除远端分支，也不把“测试需要清理”当作放弃未集成工作的授权。脚本只允许在产品清理完成后删除整个临时 fixture 根，不再直接删除其中的 task worktree 或分支。另加入错误 owner、receipt 和 integrated ref 的负向断言。

临时 fixture 根最终删除仍由测试框架负责，因为它不是 Buildr 管理的任务资源。

### 5. 收尾恢复验证正式可恢复入口

场景先推进一个真实 finish run 到目标观察，制造目标 ref 变化并得到 `target-race`，再通过同一收尾入口恢复。摘要比较恢复前后步骤 attempts/effects/evidence，证明只重跑失效步骤及下游。

### 6. 子进程终态以 close 后完整缓冲为准

supervisor 同时记录 `exit` 与 `close`，只在 stdout/stderr 流关闭后解析结构化结果；超时或解析失败时输出 task、pid、exit code、signal 和受限长度的 stdout/stderr。finally 路径等待终止和资源释放完成，避免空输出和孤儿进程。

## Risks / Trade-offs

- [组合场景更真实导致 Candidate 变慢] → 使用最小仓库和只读 CLI 动作，并为每阶段记录耗时，保持现有预算或以测量结果显式调整。
- [失败注入使清理逻辑复杂] → 所有资源创建后立即登记 owner，清理采用幂等倒序执行并在摘要中逐项报告。
- [并发时序测试仍可能受机器负载影响] → 以 ready/lease evidence 建立屏障，不依赖固定短暂 sleep 判断并发。
- [产品清理入口暂时缺少某种组合动作] → 优先组合既有登记动作；若必须新增公开行为，先更新本 Change 的 proposal 和 delta，而不是在测试中绕过。

## Migration Plan

1. 扩展 fixture 与 supervisor，保留现有摘要字段兼容已有消费者。
2. 分步加入 CLI 实际执行、多仓、并发启动、竞态恢复与产品清理证据。
3. 增加成功、失败注入和 worker 异常测试。
4. 运行该 gate 的重复稳定性测试，再纳入完整 Candidate。

回滚时可恢复旧验收脚本和摘要版本；这不会改变生产数据或用户 Workspace。

## Open Questions

无。若实现调查发现现有产品清理入口无法覆盖规范要求，应暂停并更新 Change，而不是回退为直接 Git 删除。
