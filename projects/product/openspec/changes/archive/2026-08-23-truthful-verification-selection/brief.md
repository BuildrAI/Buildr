# 可信验证选择与预算准入

## 一句话摘要

让 Buildr Product 在执行测试前诚实回答“为什么跑这些步骤、是否缺少 owner、声明预算是否可能完成”，并让普通 ownership 维护不再无条件触发完整 Candidate。

## 背景与问题

当前 changed planner 把路径 ownership、Candidate execution graph 和全局 Full 输入集中在 `registry.mjs`。机械新增、迁移或重命名 owner 因此会提升为完整 Candidate；unknown path 与 production owner gap 虽然仍出现在 plan 中，却通过 Full fallback 继续执行，容易制造“全部测试通过即 owner 已证明”的完成误报。当前 Candidate 总预算 120 秒也低于 step 目标耗时在容量约束下的理论下限。

## 目标与非目标

目标是拆分 ownership 与 execution authority、让 owner gap 在执行前失败关闭，并让 plan 输出可复核的范围理由和预算下限。非目标是本次立即优化生命周期 fixture、拆分正式 Release lane，或改变通用 Task Verification schema。

## 受影响用户或角色

- 日常修改 Buildr Product 的 Agent 与维护者：更快得到可信 affected 反馈。
- 审查 Task Verification 证据的维护者：能够识别 owner gap 与数学上不可能的预算声明。
- 后续 Parent Contributions：可以基于稳定选择边界拆分 Core Full/Release lane并优化重型 fixture。

## 核心流程

Changed runner 先规范化路径并读取独立 ownership authority，审计 direct owner 与 production owner coverage；存在 gap 时返回结构化 blocked plan。选择闭合后，planner 从 registry execution graph 展开依赖，结合 execution profile 计算总工作量、关键路径和资源容量下限；声明预算低于下限时在启动 admission 前阻断。只有 ready plan 才进入 admission 和业务 verifier。

## 关键变化

- owner 映射维护与执行图变化不再共享同一个 Full 触发文件。
- unknown path 与 direct production owner gap 不再由 Full fallback 掩盖。
- plan 增加 step count、总目标耗时、全局/依赖/资源下限、限制性约束与预算可行性。
- 当前 Candidate 使用诚实过渡预算，Core Full 的 180 秒目标由后续范围与成本 Contribution 继续收敛。

## 影响、风险与兼容性

Owner gap 从“运行 Full”改为“执行前失败”属于有意的失败语义变化，会暴露现存映射缺口。Planner JSON 将增加字段但保持既有路径、scope、steps 与 reasons；Product test-only planner 不进入 installed Project contract。迁移 inputs 时必须证明 step、Candidate membership、依赖和 primary evidence coverage 不变。

## 验收摘要

Owner-only 与 timing/report-only 变化选择 affected；execution semantics 变化选择 Full；unknown/production owner gap 返回 closed diagnostic 且不启动 verifier；预算估算覆盖全局容量、依赖关键路径和资源容量，数学上不可行的声明执行前阻断；代表路径回放没有漏选或 primary owner 损失。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
