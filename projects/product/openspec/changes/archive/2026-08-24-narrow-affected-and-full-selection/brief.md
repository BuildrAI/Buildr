# 收窄 Product affected 与 Full 选择

## 一句话摘要

用真实 planner 和 Execution Record 解释每个 changed path 如何选择 evidence，收窄已证明过宽的 affected/Full 规则；若选择本已足够窄，则诚实指出剩余重型 primary owner。

## 背景与问题

公开验证模型已经区分证据、选择范围和验证对象，但当前 changed JSON 没有公开已有 selection audit，step reasons 也没有结构化区分 direct owner、Full 展开和 dependency closure。Full pattern 与 reason code 分散在 ownership 和 planner 特判中。近期正式 daily-full 实测 427.8 秒，明显高于 360 秒目标预算，但该数字本身不能证明普通 Task 经常错误进入 Full。

## 目标与非目标

- 目标：稳定解释 affected/Full、集中 Full reason authority、审计真实普通 Task、只修正已证明过宽的 mapping、重算预算与容量下限。
- 非目标：不重写 registry/scheduler/Test Context，不删除无替代 primary evidence，不提高全局并发，不执行真实发布，不把架构清晰冒充耗时收益。

## 受影响角色

Buildr 维护者、执行正式 Task Verification 的 Agent，以及解释 Product 验证计划的用户将获得结构化 selection trace 和基于真实样本的性能结论。公共 Task Verification Result schema 不增加另一套选择 authority。

## 核心流程

1. 从 frozen changed paths 生成唯一 planner plan。
2. ownership authority 给出 path owner 或稳定 Full reason；unknown/unowned 高风险输入阻断。
3. audit 在同一 plan 上区分 direct owner、Full 展开和 dependency closure，并投影 boundary、primary owner、public outcome。
4. 代表性 Task 的 planner 选择与 sealed Execution Record 墙钟分别用于 selection amplification 与 owner cost 分析。
5. 只有真实反例证明过宽时才收窄；否则保留 owner 并形成“选择不是主要瓶颈”结论。

## 关键变化

- Full scope authority 采用结构化 pattern/code/explanation，并保留旧 inputs 投影。
- `test:changed -- --json` 新增同 plan 的 selection audit，不改变既有字段。
- 普通逻辑、Finish、Workspace/Worktree/process、关键 authority 和 unknown/unowned 形成真实反例。
- 审计报告 Full 升级率、step 数、中位/P90、reason 分布、重型 owner、层级粒度和数据缺口。

## 影响、风险与兼容性

新增 JSON 字段保持向后兼容；旧字符串 reasons 和 `VERIFICATION_FULL_SCOPE_INPUTS` 暂时保留。最大的风险是为减少 Full 而漏测，因此 planner/registry/ownership/scheduler/executor 与未知高风险输入仍 fail closed，Candidate/Release-only coverage 另行闭合验证。

## 验收摘要

Change 实现阶段必须完成真实 planner 反例、before/after audit、strict/preflight 和定点反馈。正式 daily-full、Product Artifact Candidate、Release contract/smoke 及 Task lifecycle evidence 在 Change convergence/archive 后由正式 Task Verification/Review/Finish 形成，不写入 Change checklist。

## 现场结论

三个近期、可回放的正式`product.delivery`样本中，2个保持affected，1个因registry execution graph变化合法Full；Full升级率为33.3%，selected steps中位15/P90 53，正式墙钟中位88.692秒/P90 320.841秒。before/after选择集合没有变化，因此没有执行时间收益可归因于本Change。已证明的问题是ownership authority自身此前只跑affected，以及未知高风险application path可被通用owner掩盖；现分别改为稳定`ownership-authority-change` Full和fail-closed blocked。当前主要瓶颈仍是被正确选择的真实primary evidence owner。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Product verification delta](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
