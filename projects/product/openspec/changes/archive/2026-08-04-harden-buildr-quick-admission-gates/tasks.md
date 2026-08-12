## 1. 准入事实与门禁

- [x] 1.1 将只读审查结论固化为所有 registry step 的环境足迹、隔离方式和重置负担事实
- [x] 1.2 扩展 registry validator，自动拒绝缺失事实、非法 Component 和非法 Quick step
- [x] 1.3 增加 planner 单元测试，覆盖 Component、重复重置和低成本 Integration 例外的 fail-closed 行为

## 2. 当前测试重新分层

- [x] 2.1 将 contract 中真实 CLI、Git、临时 filesystem/Workspace 与 cleanup 测试拆入 Integration/affected
- [x] 2.2 保留纯静态 Contract 在 Quick，并增加 Contract 源码副作用静态门禁
- [x] 2.3 将需要重复临时投射和清理的 runtime adapter contract 迁出 Quick，保留 changed/focus/Candidate identity
- [x] 2.4 更新入口契约和产品验证说明，保持 `verification.yml` schema 与 Task Verification authority 不变

## 3. 验证与报告

- [x] 3.1 运行 registry/planner、测试边界、Contract 与 Integration focused checks
- [x] 3.2 运行三轮 Quick，记录每个 step 的耗时、环境、重置负担、隔离与并发事实
- [x] 3.3 运行 affected/full 适用验证并完成 current knowledge reconcile
