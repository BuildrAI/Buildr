## Why

Buildr 的完整回归当前约 193 秒：多个 verifier 在外层 DAG 内再次无界并发，OpenSpec fixture 被两次完整执行，CLI package parity 又重复 Task、Review、Verification 和双 Task Environment 生命周期。同时，canonical spec 仍把 `test:integration:fast` 定义为低成本 Integration，但该入口实际运行 22 个完整 CLI、Git、Workspace 和生命周期 System 文件，规范、名称和真实成本已经冲突。

## What Changes

- **BREAKING**：退休误导性的 `test:integration:fast` 内部入口，以 `test:system` 明确承载完整 CLI、Workspace 和生命周期 System 测试；Quick 继续只组合真实低成本证据。
- 将 OpenSpec contract fixtures 与 convergence/recovery fixtures 划分为互斥集合，禁止 Candidate 对同一 case 执行两次。
- 收窄 CLI package parity，只比较 checkout 与同一 tarball 的代表输出和代表 mutation；Task/Review/Verification、并发 Task Environment 与安装后发布生命周期继续由各自唯一 owner 证明。
- 让双 Task acceptance 真正并发准备两个独立 Task Environment，分别形成 current Verification Result，并记录 fixture、prepare、verification、result、preview、resource 与 cleanup 阶段耗时。
- 将 55 项 CLI help 穷举检查改为同进程 contract，保留 7 个代表 topic 的真实 CLI stdout/exit/no-write 边界，删除 109 次重复冷启动。
- 校准 Candidate 的 `workspace-saturating` 有界并发：本地与普通 CI 允许两个隔离重型 verifier 并行，资源受限 CI 保持单路，避免四个独立步骤被错误串成关键路径。
- 让 Product source-layout 检查接受规范要求的受管 `CLAUDE.md` runtime bridge，避免 retained Workspace 投影造成假失败。
- 更新 Buildr 测试框架文档，完整记录测试层次、入口、环境依赖、并发边界、主要 owner、实际成本和后续优化顺序。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 修正低成本与 System 测试入口，要求 OpenSpec case 唯一 owner、package parity 最小责任、双 Task acceptance 的真实并发准备及阶段 timing，并校准隔离重型 verifier 的默认有界并发。

## Impact

- 影响 `services/buildr/package.json`、Product verification registry/System runner、OpenSpec fixture runner、CLI compatibility/package parity、并发 acceptance、架构检查及其契约测试。
- 更新 `docs/verification-ownership.md`、Buildr Service 测试说明和必要 current knowledge。
- 不修改 `verification.yml` schema、Task Verification Result、Candidate/affected 决策或发布状态机。
