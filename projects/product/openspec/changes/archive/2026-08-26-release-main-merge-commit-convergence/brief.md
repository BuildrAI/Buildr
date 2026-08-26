# release 到 main 的 merge-commit 收敛

## 一句话摘要

在保持 `dev` 线性和 release 选择 provenance 不变的前提下，为 release→main 提供一次性、有证据、可恢复的 main reconciliation，并用 merge commit 完成最终收敛。

## 背景与问题

当前 release→main 主要依赖最终 tree 相等并兼容 squash。main 曾经承载 dev 的 squash 结果后，release 与 main 可能同时修改相同文件而失去可直接合并的 ancestry；rc.24 的 PR #47 已出现真实冲突。若直接强制覆盖 main 或把 main 变更全部倒灌 dev，会破坏分支职责和来源审计。

## 目标与非目标

目标是记录 main/release 两个父提交、冲突解决 identity、post-reconciliation release generation，并让旧 Candidate/artifact/readiness 失效后重新验证。非目标是自动解决语义冲突、修改 dev 历史、放宽 main 保护、取消普通 PR 的 squash 或执行公共发布。

## 受影响用户或角色

- 发布维护者：授权一次 reconciliation、确认冲突解决结果并重新确认 Candidate。
- Buildr Release Agent：按 owner 证据执行或恢复 Git convergence，不猜测冲突解决。
- 开发者：继续使用线性 dev 与 release 的显式 `cherry-pick -x` 选择。

## 核心流程

固定 release selection → Candidate → 发现 main 冲突 → 在隔离 checkout 解决并生成 reconciliation merge commit → 递增 generation → 重跑 Candidate 与唯一 artifact → 创建/复用 carrier → release→main PR 使用 merge commit → 校验 main tree 与父提交关系。

## 关键变化

- reconciliation provenance 与 dev selection provenance 分离。
- release→main PR 的发布收敛方式固定为 merge commit。
- 新 generation 重新绑定 Candidate、artifact、readiness、carrier 和 PR。
- 失败保留 pre-operation identity、冲突 paths 和恢复入口，不做 force/reset/ours。

## 影响、风险与兼容性

影响 release selection、convergence、readiness、Candidate correlation、GitHub PR readback、release Skill 和当前发布知识。仓库全局仍可允许 squash/rebase，但 release PR 的 owner 会拒绝错误合入方式；main 的 force push 与删除保护不变。旧 squash-only 证据不能满足新的 release convergence 条件。

## 验收摘要

可在 rc.24 的现有冲突上形成一份唯一 reconciliation identity，生成新的 release source 并通过完整 Candidate；最终 main 必须是 merge commit、tree 精确匹配且父提交关系可回读。重复调用只返回幂等 readback，远端竞争或未解决冲突均 fail closed。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Release-main reconciliation spec](specs/release-main-reconciliation/spec.md)
- [Workflow delta](specs/agent-task-workflows/spec.md)
- [Governance delta](specs/open-source-release-governance/spec.md)
- [Release collection delta](specs/release-collection-model/spec.md)
- [Tasks](tasks.md)
