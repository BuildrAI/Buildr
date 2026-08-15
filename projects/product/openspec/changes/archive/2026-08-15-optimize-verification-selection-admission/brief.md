# 验证选择准确性与早失败编排

一句话摘要：让 Buildr 在开发与本地完整验证中先运行低成本准入证据，并为生产源码选择真实领域 owner，而不是只证明通用 Unit/制品步骤可达。

## 背景与问题

Buildr 的测试类型、affected 范围与 Candidate 目标已经分离，但部分 Application/Infrastructure 源码只命中 broad owner，已有领域 Integration 未被自动选择。验证框架变化又会立即并发启动完整重型 DAG，导致数秒可发现的错误在数分钟后才结束。

## 目标与非目标

目标是补齐生产源码 owner 契约、拆出必要的领域 Integration slice、增加 verification canary，并在一次 changed/candidate execution 内完成 Fast/canary 准入与重型 DAG 去重。非目标是继续拆分所有重型 System owner、修改 `verification.yml`、建设跨执行缓存或改变发布流程。

## 受影响角色

- 开发 Buildr 的 Agent/维护者：更早获得准确失败反馈，并从 plan 看到真实领域 owner。
- 候选版维护者：Candidate 行为覆盖与稳定 gate 不变，内部 primary owner 更清晰。

## 核心流程

生产路径先经 owner coverage 检查；非空 affected 或本地 Full 计划合入 Fast，验证框架变化再合入 canary。所有重型步骤等待 admission 全部通过，同一 step 在同一 run 只执行一次。GitHub Candidate 继续使用既有 preflight → artifact → shards → Candidate gate 拓扑。

## 关键变化

- 生产 Application/Infrastructure 模块必须有直接领域 owner或显式 allowlist。
- Task read model、coordination、execution record 使用独立 Integration slice并从 general 聚合排除。
- changed-path 与 verification run-CLI 成为独立 System canary primary owner。
- 本地 changed/candidate 使用单一 admission DAG 与单份 timing evidence。

## 影响、风险与兼容性

绿色 Full 会为准入等待增加约 10～15 秒上界，但失败反馈可从数分钟缩短到准入阶段。Candidate 测试文件并集、Project capability、GitHub shard拓扑、branch protection context与 Task Verification Result 均保持兼容。

## 验收摘要

- Task Entry/Retrospective 代表路径选择真实 slice。
- 新生产模块缺少 owner 时在进程启动前失败。
- admission失败不启动重型 step；通过时每个 step仅运行一次。
- Candidate Integration/System文件并集与GitHub closed coverage不减少、无重复。

## 技术 artifacts

- [proposal.md](proposal.md)
- [design.md](design.md)
- [delta spec](specs/product-verification-quality/spec.md)
- [tasks.md](tasks.md)
