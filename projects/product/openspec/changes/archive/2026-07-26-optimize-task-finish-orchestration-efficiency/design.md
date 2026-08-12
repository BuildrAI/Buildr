## Context

上一阶段在现有 checkpoint 状态机上增加了 safe handler registry，但真实收尾仍由 Agent 逐步领取 token、执行命令、搬运 JSON evidence 和提交 completion。最近一次实测的 finish run 为 7 分 51 秒、端到端约 10 分钟；一次 ref evidence 误用触发错误 target race，连带重跑验证和多个下游步骤，同时暴露 stale attempt、同 run lease、cleanup 和 durable evidence 问题。进程执行本身通常只有数秒到数十秒，主要成本已经转为 Agent 编排、工具往返和大体积 JSON 输出。

## Goals / Non-Goals

**Goals:**

- 让正常 finish 路径由产品拥有的多阶段 handler 连续推进，减少 Agent 手工 receipt、claim/completion 与日志解析。
- 让 Git ref transition、lease 恢复、cleanup 和 completion receipt 具有不歧义且可恢复的状态语义。
- 让验证 provider 直接聚合 required capabilities，并把真实进程 wall-clock 绑定到 formal-assurance attempt。
- 默认返回 compact checkpoint delta，同时保留显式完整诊断。
- 正常路径稳定在约 3 分钟；异常路径仍保留 checkpoint/resume 和精确 evidence。

**Non-Goals:**

- 不降低 affected 或 Candidate 验证覆盖与预算。
- 不允许 executor 自行解决 OpenSpec 语义冲突、Git 冲突、外部系统授权或人工资产审查。
- 不引入 Workspace 全局锁、daemon 或第二套 finish 状态机。
- 不要求普通 Skill/Rule 修改创建新 Agent session。

## Decisions

### 1. 多阶段 handler 是状态机内的受控编排，不是单命令自证

新增 `openspec-convergence` 与 `formal-verification` composite handler。handler 在同一 attempt 内产生阶段事件并调用现有 guard/provider；每个阶段仍校验 change、digest、executable、candidate 和授权，失败时把最后成功阶段写入 checkpoint。选择这一方式而不是让 Agent 手工搬运 receipt，也不把 shell 命令退出码当作整个步骤成功。

### 2. execution manifest 一次声明，executor 连续消费

`task finish run` 接受完整 execution manifest，产品按当前 checkpoint 选择匹配 handler；确定性的 evidence completion、not-applicable 和只读 observation 可连续执行。默认结果只返回本轮 delta、next action、blocked 与 timing summary；`inspect --detail full` 提供完整历史。旧参数和完整 JSON 保持兼容。

### 3. Git push 使用显式 ref transition

integration evidence 分为 `expectedBeforePush`、`observedBeforePush`、`expectedAfterPush` 与 `observedAfterPush`。只有 before observation 不一致才是外部 `target-race`；after 等于 candidate 是自身成功 transition，远端已是 candidate 是幂等成功。由 Git handler执行 observation/push/observation，避免 Agent 手工拼装前后 ref。

### 4. attempt、lease 与 invalidation 原子转换

使 step stale/blocked 时必须原子终结 running attempt并释放仍由该 attempt 持有的 lease；同一 run resume 可以识别并恢复自己的有效 lease，不得被自身残留阻塞。run complete 前校验不存在未结束 attempt、残留 lease或 stale/blocked step。

### 5. cleanup 采用 prepare/finalize 与 durable receipt

cleanup prepare 只证明可删除；实际 worktree/process/evidence cleanup完成后才提交 passed。删除 environment 前，把 compact completion receipt 原子写入 canonical Workspace task-finish history，包含 run identity、最终 refs、验证、archive、cleanup、timing 和 retained diagnostics reference。失败时 run 保持 cleanup blocked，不能预先 complete。

### 6. verification provider拥有并行调度和计时

formal-verification handler先领取 attempt，再由 provider 并行执行无依赖 required capabilities，使用跨平台单调时钟聚合真实 wall-clock并生成统一 summary。Agent不再拼接 `/usr/bin/time`、临时日志或手写 duration；单项日志按失败或显式 detail 请求返回。

### 7. 输出预算是公共 CLI 契约

doctor、finish run/advance 和 verification默认输出 summary：成功项以计数、digest和关键 identity 表达；失败项保留完整 actionable detail。完整逐资产/逐 attempt 列表只在 `--detail full` 或诊断文件中提供，避免正常收尾输出数万 Token。

## Risks / Trade-offs

- [Composite handler 隐藏中间动作] → checkpoint 保留阶段事件、identity、duration 和失败边界，`inspect --detail full` 可展开。
- [自动 Git handler 扩大副作用] → 仍只消费收尾既有授权，禁止 force push、远端任务分支和冲突自动解决。
- [compact 输出影响既有 consumer] → 保留 schema version、兼容完整模式和必要顶层字段，新增 contract tests。
- [durable receipt 积累本机状态] → 只保存 compact completion 与稳定引用，定义精确 retention/cleanup，不保存完整 stdout。
- [并行验证产生进程清理风险] → provider 持有 process ownership，聚合结果前完成 descendants cleanup并返回结构化 evidence。

## Migration Plan

1. 先扩展 checkpoint/ref/lease/completion schema并保持旧输入兼容。
2. 增加 composite handlers、compact projection 和 verification aggregation。
3. 用 unit/contract/integration 覆盖成功、target race、lease 恢复、cleanup失败和 durable receipt。
4. 使用真实 Change 执行一次完整 finish，记录命令执行、Agent编排、Token近似量和端到端 wall-clock。
5. 若新 handler 出现异常，可关闭自动计划并回落现有 `advance|resume`，已有 checkpoint 保持可读。

## Open Questions

无。durable receipt 的默认保留数量和日志详细度可作为实现内部配置，不改变本 Change 的行为边界。
