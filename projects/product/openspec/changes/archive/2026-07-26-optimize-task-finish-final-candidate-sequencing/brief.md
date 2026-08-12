# 优化 Task Finish 最终保证顺序

## 一句话摘要

让 Task Finish 先完成会改变交付树的收敛动作，再执行最终保证；只有真实竞态或内容变化才重新验证，减少无效 Candidate，同时保留 OpenSpec、Git 和运行时安全门禁。

## 背景与问题

当前收尾流程可能在 OpenSpec sync/archive、candidate commit、目标分支 rebase 和 runtime sync 尚未完成时执行最终 Candidate。后续任何树变化都会让已有 evidence 失效。最近一次实际收尾因此执行了三次 Candidate，总耗时约 292 秒，并在 archive 后暴露 active-only 测试路径问题。耗时的根因不是单次验证过慢，而是最终保证执行得早于交付树真正收敛。

## 目标与非目标

目标是把 Task Finish 划分为 delivery convergence、final assurance 和 closeout-only delivery 三个阶段；在最终保证前发现 archive 兼容问题并完成常规 rebase/runtime 收敛；明确验证失效链和重复执行成本。非目标是不承诺所有任务永远只运行一次 Candidate，不跳过必要验证，也不修改 OpenSpec 1.6.0 上游 CLI、schema 或 Skills。

## 受影响用户与角色

- Buildr 维护者：获得更短、更可解释的标准收尾路径。
- Agent：能判断哪些动作会使 evidence 失效，以及何时必须返回收敛阶段。
- 审查者：可以从结构化报告看见每次验证的耗时、失效原因和最终有效 evidence。
- OpenSpec Change 使用者：在正式归档前发现 scenario identity、delta 合并和 active/archive 生命周期问题。

## 核心流程

1. Task Finish 完成知识 reconcile、OpenSpec archive 预演、canonical sync、candidate commit、目标分支 rebase 与 runtime/doctor 收敛。
2. 在收敛后的 delivery tree 上运行项目声明的 affected 或 Candidate 保证。
3. 最终保证后只执行已证明为 closeout-only 的归档移动、focused checks、提交修订、快进集成与推送。
4. 若目标分支竞态或任何实质内容变化出现，废弃旧 evidence，返回收敛阶段并重新运行保证。
5. 收尾报告给出验证链、总耗时与最终有效 evidence。

## 关键变化

- 最终 Candidate 从“中途安全检查”调整为“交付树收敛后的最终保证”。
- 新增隔离的 OpenSpec archive compatibility rehearsal，在正式 Candidate 前暴露归档风险。
- candidate commit 和常规 rebase 前移；最终保证后只观察目标 ref，发生竞态才重入流程。
- verification evidence 增加失效原因、替代关系和累计成本。
- Project verification 显式覆盖 active 与 archived Change 生命周期。

## 影响、风险与兼容性

主要风险是错误地把会修改内容的动作分类为 closeout-only，或 archive rehearsal 与真实 archive 行为漂移。实现需要以测试和 tree identity 检查限制允许动作，并保留真实竞态后的重跑。该变更不删除现有命令或外部接口；对用户可见的变化主要是收尾顺序、报告内容和通常更少的重复验证。

## 验收摘要

- 稳定目标分支、无额外内容变化的高风险收尾只执行一次最终 Candidate。
- archive 兼容问题在最终保证前被 rehearsal 捕获。
- rebase、runtime sync 或目标竞态改变交付树时，旧 evidence 被明确标记失效并由新运行替代。
- active 和 archived Change 的验证均能定位真实资产。
- OpenSpec strict validation、知识维护检查和最终 Project Candidate 通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta Specs](specs/)
- [Tasks](tasks.md)
