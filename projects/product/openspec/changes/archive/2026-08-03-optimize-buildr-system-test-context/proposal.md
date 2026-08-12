## Why

Buildr 的 System 测试已经清除了大量重复 owner，但 Task Record、Task Review、Task Verification 与 Verification CLI 仍各自反复冷启动相同的 Workspace、Project 和 CLI 基线。当前完整 System 在本机约 56.64 秒，首批四个文件静态可见的基线 CLI 调用为 24 次，需要在不削弱隔离和并发安全的前提下减少重复环境维护。

## What Changes

- 为首批 Task 生命周期 System 测试建立一次运行内的不可变测试上下文，统一准备 Workspace、Project、Service 与 OpenSpec fixture 基线。
- 每个 test case 从基线复制独立可写 sandbox；并发测试不得共享可写 Workspace，基线污染或缺失必须 fail closed。
- `test:system` 负责准备一次共享基线并传递给 worker；单文件直接运行时允许在该进程内惰性准备一次等价基线。
- 首批迁移 `task-record-product`、`task-review-product`、`task-verification-product` 与 `verification-run-cli`；验证 init、Project/Service 创建、Task Environment 迁移和 Task Finish Git 旅程的测试继续完整隔离。
- 在不重复 baseline 的前提下，把当前最大串行 owner `task-record-product` 按持久化/CLI、Change Resolver、Local App/target boundary 拆为三个可并行文件；不拆其他 System owner。
- 删除 Task Record/Review/Verification System 中已由 Application/Integration owner 完整证明的重复状态矩阵 CLI 冷启动；每个公开命令仍保留代表真实 CLI JSON/失败边界，Local App、Git 与 target boundary 证据不变。
- 记录上下文准备次数、迁移前后墙钟和清理结果，以实测决定后续是否扩展；不建设跨运行缓存、daemon、通用 fixture 平台或共享可写 Workspace。
- 保持既有 14 路文件并发，只在 System runner 内粗粒度前置已知长 owner，避免 Task Environment 与 Task lifecycle 文件因字母序形成尾部关键路径。
- 同步 Buildr 测试框架文档，明确上下文复用、隔离边界和不适用测试。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 要求可复用的 System fixture 只共享不可变基线，每个 test case 保持独立可写 sandbox，并为验证初始化或全局生命周期的测试保留完整隔离。

## Impact

- 影响 `services/buildr/test/verification/system.mjs`、verification registry、新增的 System test context/helper、首批四类 System 测试及 Task Record 文件划分、相关契约测试。
- 更新 `docs/verification-ownership.md` 与 `product-verification-quality` canonical spec。
- 不修改 `verification.yml`、Task Verification Result、测试分类、Candidate/affected 选择或产品 Task 生命周期行为。
