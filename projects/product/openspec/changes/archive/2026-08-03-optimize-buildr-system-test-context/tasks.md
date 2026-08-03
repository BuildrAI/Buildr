## 1. 建立 System 测试上下文

- [x] 1.1 实现 `task-lifecycle/v1` 基线的准备、marker/identity 校验、独立 sandbox 复制和精确 cleanup
- [x] 1.2 让 `test:system` 在 child runner 前只准备一次 context，并输出 setup/cleanup diagnostics
- [x] 1.3 补充测试边界契约，约束首批消费者、不可变基线和必须保持完整隔离的测试

## 2. 迁移高重复 System 测试

- [x] 2.1 将 Task Record、Task Review 与 Task Verification System fixtures 改为复用 context 副本
- [x] 2.2 将 Verification CLI 的五个重复 Workspace/Project fixtures 改为复用 context 副本
- [x] 2.3 保持 Workspace/Project/Service、Task Environment、安装、迁移与 Task Finish Journey 的现有独立环境 owner
- [x] 2.4 在共享 baseline 下按三个 owner group 拆分 Task Record 最大串行 System 文件，不复制 fixture setup
- [x] 2.5 将 Task Record/Review/Verification 状态矩阵交给既有 Application/Integration owner，System 只保留代表 CLI/Local App/Git/target 边界
- [x] 2.6 让 System runner 只以粗粒度固定顺序前置已知长 owner，保留 14 路并发和确定性字母序 fallback
- [x] 2.7 将新增 helper 路径映射到唯一 System registry owner，保持 affected planner fail closed

## 3. 同步测试框架事实

- [x] 3.1 更新 `docs/verification-ownership.md`，简要记录 context 内容、并发/清理边界、首批消费者和保留隔离项
- [x] 3.2 完成 Brief、Buildr Service current knowledge 与术语影响收敛，不引入第二套测试或 Task Verification authority

## 4. 验证与性能收敛

- [x] 4.1 运行迁移后的 System owners、相关 Integration/Unit 与 contract，验证单文件 fallback、隔离与行为不回归
- [x] 4.2 运行完整 System，对比 56.64 秒基线、context setup 次数、基线 identity 与 cleanup 结果
- [x] 4.3 运行 Quick、affected 开发验证与主动审查，修复候选上的全部回归；冻结后的 portable Result 由 Task Verification 生命周期维护
