# 变更说明：提升发布流程时序稳健性

## 一句话摘要

消除发布流程中两类把"慢"误判成"失败"的时序抖动：npm 发布后的 Registry 回读改为有界轮询，runtime launcher 交接等待预算改为 CI 感知；两者都不削弱保守安全默认。

## 背景与问题

发布 `0.1.0-rc.35` 时，产物与代码均正确，却因纯时序问题两次触发 false block，需要人工恢复：

- `trusted-publish.ts` 在 `npm publish` 成功后只做一次立即 Registry 回读。npm 传播实际约 4 分钟，单次回读读到"未发布"，于是一次成功的发布被误判为 `npm-publication-unconfirmed` 并阻塞。
- runtime launcher 交接的等待预算固定为 2 秒（`attempts=40 × intervalMs=50`）。负载较高的 Windows CI runner 上，旧实例认证退出超过 2 秒即抛 `launcher_handoff_shutdown_timeout`；逐字节相同的代码重跑即通过，证明是环境时序而非逻辑回归。

## 目标与非目标

**目标**：发布成功但 Registry 传播滞后时回读自动收敛，无需人工干预；CI 负载导致的交接慢不再误报超时。

**非目标**：不改变 dist-tag 收敛、tag、GitHub Release、smoke 等既有发布步骤语义；不改变 launcher 交接的错误码、CLI/HTTP/JSON 契约与本地默认预算；不实现经调研判定不值得做的 P1、P3（见下）。

## 受影响用户或角色

- **发布维护者**：发布阶段更少因传播延迟被误判阻塞，减少人工轮询与幂等重跑。
- **CI / 候选验证**：Windows 分片更少因交接 2 秒预算过紧而偶发失败。
- **本地交互用户**：行为不变——真实 hang 仍在 2 秒内快速暴露并给出明确错误。

## 核心流程

发布执行配方不变：复核原包 → 平台权限 → 引用与来源 → 官方 npm/标签/发布说明状态 → 发布原包 → 回读与官方安装验证。本变更只细化"发布原包 → 回读"这一步：回读在有界时间窗内**重复只读**同一精确 version + integrity，命中即确认，窗口耗尽才按 `npm-publication-unconfirmed` fail closed，**绝不**因单次未命中而重复 publish。

## 关键变化

- **P0**：`publishFrozenArtifact` 发布后的单次回读替换为有界轮询（生产默认约 24 次 × 20 秒），复用既有 `registryWait` 注入约定与 `isTransientReleaseError` 瞬态判定；integrity 冲突立即停止，不空等。
- **P2**：`instance-lifecycle.ts` 按环境计算交接等待预算并注入两处 handoff 等待；本地默认与改动前逐毫秒等价，CI（`process.env.CI`）或显式 `BUILDR_LAUNCHER_HANDOFF_WAIT_MS` 覆盖时放大。runtime 默认值不动。

## 不做项（经调研）

- **P1（pre-candidate 本地门禁 preflight）不做**：会与完整候选形成可能分歧的第二权威；本次确定性问题在冻结前已于 `dev` 修复、从未进入候选；goldens 需完整前端构建并不"廉价"。边际收益小于治理风险。
- **P3（放宽 `classifyCandidateFailure` transient 正则）不做**：保守的 `diagnosis-required` 默认是安全属性；放宽会把真实确定性回归（真实死锁/发布失败也"像超时"）误判为可自动重跑而掩盖问题。其唯一合理诉求已被 P0 从源头消除。

## 影响 / 风险 / 兼容性

无破坏性变更：公开 CLI、HTTP、JSON、错误码、npm 产物与 tag 语义均不变；无数据迁移、无 schema 变更。风险与缓解：回读窗口设短仍可能误报（取明显大于实测传播时间的有界值，且耗尽后保留原 fail-closed，不比现状差）；CI 预算放大可能延后真实 hang 暴露（仅 CI/覆盖路径放大，本地默认不变，CI 下最终仍抛同一错误码）。

## 验收摘要

- P0：新增两条 `publishFrozenArtifact` 测试——传播延迟下收敛为 published 且 publish 只派发一次；窗口耗尽报告 `npm-publication-unconfirmed` 且不重复 publish。既有发布恢复测试全绿。
- P2：新增 `handoffWaitBudget` 单测——非 CI 预算等价 2 秒、CI/覆盖放大、非法覆盖回退默认。
- 两个 tsc 工程（`tsconfig.json`、`tsconfig.test.json`）零错误；`openspec validate --strict` 与收敛 preflight 通过。

## 技术 artifacts 入口

- `proposal.md`（why 与 scope）
- `design.md`（技术取舍与 P1/P3 否决理由）
- `specs/open-source-release-governance/spec.md`（发布回读有界收敛的规范增量）
- `tasks.md`（实现与验证清单）
