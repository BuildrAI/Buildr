## 1. 修正测试层次与入口

- [x] 1.1 将历史 `integration-fast` 目录、script、registry step 和引用迁移为真实 `system` 边界
- [x] 1.2 更新入口、planner、registry 与架构契约测试，确保 Quick 不选择 System

## 2. 删除重复工作并降低环境成本

- [x] 2.1 将 OpenSpec fixture runner 划分为互斥 `contract` / `recovery` suites，并验证并集完整、交集为空
- [x] 2.2 收窄 CLI package parity 为代表输出与代表 mutation，删除 Task/Review/Verification/双 Environment 重复生命周期
- [x] 2.3 让 concurrent Task acceptance 并发准备两个 Environment，记录各阶段 timing 并保留顺序 cleanup 证明
- [x] 2.4 让 Product source-layout 接受受管 `CLAUDE.md` runtime bridge，同时继续拒绝未知源码入口
- [x] 2.5 校准 `workspace-saturating` profiles：默认本地/CI 两路、资源受限 CI 单路，并用 scheduler 契约与 Full timeline 验证
- [x] 2.6 将 55 项 help 穷举检查收敛为同进程 contract，只保留 7 项真实 CLI 边界
- [x] 2.7 删除 acceptance 重复 Result inspect/cleanup guard，并并发执行独立 invocation、preview stop 与 Task abandon

## 3. 同步测试框架事实

- [x] 3.1 更新 Buildr 测试框架文档，完整列出测试层次、入口、环境、并发、owner、实际成本和优化结论
- [x] 3.2 完成 Brief、current knowledge 与术语影响收敛，确保无第二套测试或 Task Verification authority

## 4. 验证与性能收敛

- [x] 4.1 运行入口、planner、OpenSpec suite、package parity、acceptance 和 source-layout focused tests
- [x] 4.2 运行 Quick 与 affected 验证，修复所有功能或契约回归
- [x] 4.3 在冻结候选上运行一次 Full，比较逐 step/总耗时、主动审查证据 owner 并完成最终修订
