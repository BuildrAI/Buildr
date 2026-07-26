# Task Finish 编排效率与证据可靠性优化

## 摘要

在已有 safe executor 基础上，把 OpenSpec convergence、正式验证、Git ref transition、cleanup和完成证据收敛为产品拥有的低往返编排，使普通收尾从当前约7–10分钟稳定到约3分钟。

## 背景与问题

上一轮真实收尾中，命令执行本身并不慢，但Agent需要反复领取step、拼装JSON、搬运receipt、读取大体积输出并恢复状态。一处push ref evidence歧义触发错误target race，进一步暴露lease残留、验证计时失真、cleanup预先完成和run evidence随worktree删除等问题。

## 目标与非目标

目标是减少Agent工具往返和Token消耗，同时提升finish状态、恢复、计时与durable evidence的真实性。不会降低affected/Candidate覆盖，不允许自动解决语义或Git冲突，也不扩大push、外部系统或人工审查授权。

## 核心流程

Agent一次声明完整execution manifest；Task Finish按checkpoint选择受控composite handler，自动完成无歧义的convergence、verification、observation和evidence completion。异常停在精确子阶段并继续使用resume。Git push记录完整ref transition，cleanup实际完成后才写canonical completion receipt并删除environment。

## 关键变化

- 产品持有OpenSpec convergence receipt和阶段恢复。
- verification provider聚合并行required capabilities与真实wall-clock。
- Git ref evidence区分push前后状态。
- stale attempt、lease和cleanup进行原子状态转换。
- 正常输出默认compact，完整诊断按需展开。
- finish completion在canonical Workspace保留durable receipt。

## 影响、风险与兼容性

影响Task Finish CLI/application/run、验证provider、OpenSpec helper、Git integration和task environment cleanup。保留现有CLI入口与手动checkpoint/resume回退；主要风险是composite handler隐藏中间状态，通过阶段事件和full detail诊断控制。

## 验收摘要

unit、contract、integration-fast和archive-sensitive affected验证通过；真实finish不得将自身push误判为race，不得残留attempt/lease，不得在实际cleanup前complete，并分别报告执行、编排、恢复、Token近似量和端到端wall-clock，目标稳定约3分钟。

## 技术artifacts

- `proposal.md`
- `design.md`
- `specs/task-finish-execution/spec.md`
- `specs/task-verification/spec.md`
- `tasks.md`
