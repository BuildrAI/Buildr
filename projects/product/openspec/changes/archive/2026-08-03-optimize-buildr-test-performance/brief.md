# 优化 Buildr 测试执行性能

## 一句话摘要

让 Buildr 完整回归删除重复生命周期、按真实 System 边界命名重型测试，并让互相隔离的 Workspace verifier 有界并发，同时保留每项产品风险的唯一证据。

## 背景与问题

冻结基线 Full 用时 193.161 秒且因受管 `CLAUDE.md` 假失败。主要成本不是单一测试框架慢，而是四类问题叠加：System 套件被误称为 fast Integration；两个 OpenSpec step 重复全部 15 个 case；package parity 重跑 Task/Review/Verification/双 Environment；四个独立 Workspace 重型 step 又被容量 1 强制串行。

## 目标与非目标

- 目标：删除重复 owner，降低环境启停次数，校准有界并发，输出可定位阶段 timing，并完整说明 Buildr 当前测试框架。
- 非目标：不增加 Task Verification schema/capability，不引入测试平台、自适应 scheduler、fixture daemon 或性能历史数据库。

## 受影响角色

主要影响维护 Buildr 的 Agent、开发者和 CI；用户 Project 的 `verification.yml` 与 Task Verification Result 不变。

## 核心流程

研发期使用 Quick、changed 或 focus；冻结候选使用同一 registry 的 Full。Full 保留所有 required primary owners，但 OpenSpec case 只执行一次，package parity 只验证代表输出与 mutation，双 Task acceptance 自己持有并发 Environment/Result 事实，隔离的重型 verifier 最多两路并行。

## 关键变化

- `test:integration:fast` 迁移为真实 `test:system`，不保留误导 alias。
- OpenSpec fixtures 分为互斥 contract/recovery suites。
- package parity 删除 Task、Review、Verification 和双 Environment 重复生命周期。
- concurrent acceptance 并发 prepare、verification、Result record、preview 和独立 cleanup 动作，只让必须证明先后关系的 Environment cleanup 串行。
- CLI compatibility 穷举 55 项同进程 help contract，只保留 7 个代表 topic 的真实 CLI 进程边界。
- 默认 `workspace-saturating` 两路，资源受限 CI 单路。
- source-layout 接受 canonical 受管 `CLAUDE.md` bridge。

## 影响、风险与兼容性

`npm test`、`test:changed`、`test:focus`、`test:candidate` 和 Task Verification authority 保持不变；维护者直接调用旧内部 `test:integration:fast` 需要改用 `test:system`。主要风险是并发争用与 parity 缩窄遗漏，分别由 Full timeline、release tarball smoke 和各 lifecycle primary owner 验证。

## 验收摘要

Quick 不包含 System，两个 OpenSpec suites 交集为空且并集完整，package parity 只持有一致性，双 Task prepare/Result 隔离成立且 cleanup 安全，55 项 help contract 与代表进程边界都通过，source layout 不再假失败。最终文档冻结前的干净候选 Quick 为 6.4 秒、Changed 为 148.543 秒、Candidate 为 147.819 秒且全部通过；120 秒观察预算仍未稳定达成，后续继续处理 System 内层 fan-out 与重复 CLI/Workspace baseline。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Verification quality delta](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
