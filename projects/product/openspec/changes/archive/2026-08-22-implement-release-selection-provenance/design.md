## Context

`tools/release` 是 checkout-only owner。Selection 事实必须能从 Git 本身重建，避免第二个持久化 store，也不能把 Task、Verification 或 publication 的专业 Result复制进 release 工具。

## Goals / Non-Goals

**Goals:**

- 为 release owner 提供可验证、可恢复的本地 selection lifecycle。
- 让后续 Candidate/readiness consumer 只需读取稳定的 selection read model。
- 在冲突、漂移和未授权状态下保持 `effects: []`。

**Non-Goals:**

- 不实现 Candidate、artifact、Task correlation、publish 或 main/dev convergence。
- 不写 SQLite、Task Record、Verification Result 或远端 refs。

## Decisions

### Git ref 作为生命周期事实

- release branch 使用 `release-<version>`。
- 创建时写入 immutable `refs/buildr/release/<version>/baseline`，指向用户指定的 `dev` commit。
- `freeze` 写入 `refs/buildr/release/<version>/frozen`；`abandon` 写入 `refs/buildr/release/<version>/abandoned`。这些 refs 只记录状态与当时 HEAD，不代表远端已删除。
- inspect 只读取 branch、上述 refs、commit history 和 tree；不存在 JSON/SQLite release store。

### Selection chain

从 baseline 到 branch HEAD 的第一父链按时间逆序恢复。每个纳入 commit 必须包含 Git `cherry-pick -x` 的 source trailer；read model 返回 source dev commit、result release commit、changed paths 与顺序。generation 是 baseline 之后的 selection 数量，baseline 本身为 generation `0`。

### Fail-closed Git operations

- create 要求 clean worktree、精确 baseline 可解析且属于 `dev` ref；已有 branch 或生命周期 ref 不得覆盖。
- update 要求 source 属于当前 `dev`、位于 baseline 之后、尚未选择、集合未 freeze/abandon；只调用 `git cherry-pick -x <source>`。
- cherry-pick 非零退出时保留冲突现场，不写 release ref，不继续后续选择，返回冲突路径和 `git cherry-pick --abort` 恢复动作。
- freeze/abandon 是幂等但不扩大授权；cleanup 只删除本地 branch 与本地 provenance refs，若发现 remote matching ref 则拒绝并要求独立远端授权。

### Public API

导出 `createReleaseSelection`、`selectReleaseCommit`、`inspectReleaseSelection`、`freezeReleaseSelection`、`abandonReleaseSelection`、`cleanupReleaseSelection`。CLI 使用 `release-selection.mjs <operation>`，所有成功和失败输出统一 JSON；`effects` 明确记录本地 Git ref/commit 变化，远端和公共副作用永远为空。

## Verification

使用临时 bare remote 与 clone 验证 create/update/inspect/freeze/abandon/cleanup、非选择 commit 不会混入、dev 漂移、冲突 fail closed、冻结后更新拒绝、远端 ref 存在时 cleanup 拒绝以及 `cherry-pick -x` provenance 可重建。

## Risks / Trade-offs

- Git refs 是本地 provenance 的载体，删除本地集合后 read model 不再可用；因此 cleanup 需要显式确认并拒绝远端资源漂移。
- Git history 只能证明 `cherry-pick -x` 的 source，不证明维护者身份；本 Change 保持 checkout-only，授权由上层 release workflow 另行核验。
- 只支持单 commit update，换取冲突边界和 generation 变化可精确对账。

## Migration Plan

1. 先在 `tools/release` 增加 selection owner 与 focused tests。
2. 后续 P1-B/P2 只消费 inspect/freeze read model，不复制其状态。
3. P3 再负责受保护的 release→main、main→dev 与远端 cleanup。
