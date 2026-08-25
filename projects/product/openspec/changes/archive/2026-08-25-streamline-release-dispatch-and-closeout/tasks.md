## 1. Timeline 领域模型

- [x] 1.1 定义 `buildr.release-phase-timeline/v1` portable schema、规范化 identity 与 compact summary
- [x] 1.2 实现阶段时间、等待分类、Candidate 多 attempt 与 reused evidence 投影
- [x] 1.3 增加 timeline 单元测试，覆盖缺失时间、不估算 duration 与多 attempt evidence 复用

## 2. Release 编排

- [x] 2.1 实现 `prepare-dispatch`，复用 current readiness owner 并返回 frozen context approval request
- [x] 2.2 实现 `dispatch`，要求显式 publication 授权与 expected context digest 后调用 protected transaction owner
- [x] 2.3 实现可恢复 `closeout`，串联 hosted evidence、dev reconciliation、Git closeout 与 lifecycle closed 检查
- [x] 2.4 通过 Environment Receipt retained controller 完成 Task no-change completion、Environment cleanup 与最终 Doctor
- [x] 2.5 增加 partial failure、terminal Task resume、cleanup authorization 与 candidate-controller 禁写 canonical authority 的测试

## 3. 入口与知识同步

- [x] 3.1 提供 release orchestration CLI/JSON 入口与 compact/full output，保留既有 owner 诊断入口
- [x] 3.2 更新 `buildr-release` Skill、release checklist 与 Buildr Service current knowledge
- [x] 3.3 完成 focused/affected 开发反馈并修复主体实现问题

## 4. 前置任务交付后联合验收

- [x] 4.1 在 `stabilize-remote-skill-timeout-test` 与 `support-candidate-failed-shard-retry` 均交付后，使用真实 failed-shard retry facts 验证 timeline
- [x] 4.2 验证 PR merge 后 readiness 到 dispatch 以及 Publication 后一键 closeout 的完整恢复路径
