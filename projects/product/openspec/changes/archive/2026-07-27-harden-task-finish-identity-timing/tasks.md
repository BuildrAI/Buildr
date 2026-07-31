## 1. 当前有效身份与证据投射

- [x] 1.1 让 checkpoint 与 completion receipt 只投射最后一次成功 completion identity 引用的 evidence/effect
- [x] 1.2 增加身份失效、重试与 receipt 过滤的单元和集成回归测试

## 2. 产品观测计时

- [x] 2.1 按 attempt token 汇总 command/stage observation，记录 execution、orchestration 与 timing source
- [x] 2.2 让 formal assurance 阶段指标使用可信 execution duration，并保持旧 run 兼容和 coverage 可见
- [x] 2.3 增加自动执行、并行 stage 与外部未观测 provider 的计时回归测试
- [x] 2.4 修复真实 finish 中 verification summary 被重复归入 orchestration 和 unobserved interval 的分类缺陷
- [x] 2.5 让可信的 failed/incomplete verification summary 只完成 blocked attempt，并拒绝 outcome 与 summary status 不一致

## 3. 当前诊断生命周期

- [x] 3.1 在有效恢复和成功推进后清除已解决的 current diagnostic，同时保留历史 artifact
- [x] 3.2 增加 compact/full checkpoint 的诊断清理回归测试

## 4. 契约与验证

- [x] 4.1 更新 Task Finish 产品文档或 Skill 中受影响的 evidence/timing 行为说明
- [x] 4.2 修复 OpenSpec candidate audit 的目标基线与 v3 convergence receipt 覆盖，兼容 transition-only identity、旧 delta 自洽且 canonical 仅 append-only 演进的合法 v2 receipt，并增加安全重规划和 fail-closed 回归测试
- [x] 4.3 运行聚焦测试、affected verification、OpenSpec strict validation 与 contract guard
