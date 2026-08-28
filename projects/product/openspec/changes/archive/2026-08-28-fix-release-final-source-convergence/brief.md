# 发布最终源收敛

一句话摘要：让 release 在完整 Candidate 前完成 main 内容覆盖检查与保持 tree 不变的历史收敛，并强制所有发布 Git mutation 只发生在 matching release Task Environment 中。

## 背景与问题

当前流程先运行完整 Candidate，再把 current main merge 回 release。main/dev 发布后不共享祖先历史时，该 merge 会重复制造版本材料冲突，并可能把 main 上已被 dev 替代的旧发布实现重新带入 release；错误调用还可切换和污染 retained workspace。

## 目标与非目标

目标是先形成唯一最终 release SHA/tree，再运行一次完整 Candidate，使唯一 tarball、carrier、main 与 publication绑定同一source；main有独有产品内容时必须先回到dev。

非目标是恢复main→dev merge、改变npm OIDC事务、允许main内容绕过dev进入release，或让retained workspace承担发布执行。

## 受影响用户或角色

- 维护者：发布准备不再在Candidate后处理同类冲突或重复运行昂贵验证。
- Agent：只在release Task Environment中操作，并从owner读取main coverage与final source事实。
- Buildr：保留main历史、dev来源与发布制品identity，同时阻止错误checkout和内容漂移。

## 核心流程

维护者从dev baseline与明确source commits形成release selection；owner在matching Environment中固定current main并检查其内容是否已由dev/release provenance覆盖。覆盖通过后创建双亲、tree不变的历史收敛commit并冻结final generation；随后运行完整Candidate、创建唯一tarball和carrier，经受保护PR合入main并发布同一制品。

## 关键变化

- main reconciliation移动到Candidate之前。
- reconciliation不再运行工作树merge，不改变release tree。
- main独有内容必须先交付dev。
- retained primary worktree与错误Task worktree在Git mutation前失败。
- Candidate后main漂移形成新generation，不允许merge已验证source。

## 影响、风险与兼容性

旧release generation、Candidate和tarball继续保留为历史evidence，但不能满足final source currentness。旧调用方若未提供matching Environment binding会确定性失败。rc.28尚未公开，可在修复交付dev后通过reopen/refreeze恢复，不需要新版本。

## 验收摘要

- 连续两个候选版本即使main/dev历史分叉，也不会产生版本材料工作树冲突。
- main独有产品内容被明确阻塞，不会自动进入release。
- final reconciliation commit有两个父提交且tree等于pre-state release tree。
- Candidate、tarball、carrier、main和publication绑定同一final generation。
- retained workspace始终保持原branch与clean状态。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/release-main-reconciliation/spec.md`
- `specs/release-collection-model/spec.md`
- `specs/open-source-release-governance/spec.md`
- `tasks.md`
