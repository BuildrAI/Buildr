# 去重跨层验证证据

## 一句话摘要

用可执行的 primary evidence map 和代表性 changed selection 审计，区分 Product 日常验证慢是 affected 选宽还是必要黄金 owner 自身过重，并只在反例与覆盖闭合时去重。

## 背景与问题

当前日常 Core 干净基线中位数约 267.561 秒。现有 registry 与 planner 能给出 owner、scope reason 和 timing，但还不能在同一结果中解释每个慢 Integration/System owner 证明什么、公共结果是什么、是否与低层测试重复，以及普通任务为何扩张为更多 steps 或 Full。因此维护者容易把 Git、Workspace、进程和 cleanup 成本误认为 Node 测试框架固有限制，也可能让过宽 affected 掩盖真实 owner 成本。

## 目标与非目标

目标是建立 registry 派生的证据地图、审计近期普通变更的选择放大、排除日常 Core 中的 Release-only 主证据，并输出后续可安全优化的残余黄金 owner 与数学下限。非目标是新增 Test Context、扩大并发、缓存被测结果、削弱 Candidate/Release，或在本阶段承诺 Core 必须降低到某个数字。

## 受影响用户或角色

- 日常修改 Buildr 的 Agent：获得更窄且可解释的 changed/affected 反馈。
- 审查 Verification 的维护者：能核对 primary/supporting evidence、Full 原因和 Release-only 排除。
- 后续黄金执行路径 Contribution：获得 Finish、Workspace、Worktree、Candidate 与进程 owner 的真实基线。

## 核心流程

审计器从唯一 registry 派生慢 owner evidence map，并复用 changed planner 对显式 Git base/head 汇总 changed paths、直接 owner、依赖扩张、step count 与 Full reason。候选重复事实先由低成本 owner 的确定性反例证明；只有 Candidate union、唯一 owner、代表路径和 Release exclusions 全部闭合后，才调整 ownership 或 Core membership。无法替代的真实黄金边界保留并记录理由。

## 关键变化

- 慢 Integration/System owner 具有公共结果、反例、证据角色和唯一 primary evidence owner。
- 选择审计分离 selection amplification、owner execution cost 与环境竞争。
- Release-only owner 反向闭合验证为不属于日常 `core` profile，同时保留 Candidate/Release authority。
- 形成残余黄金 owner、当前基线与新的数学下限，不预设不诚实预算。

## 影响、风险与兼容性

变化集中于 `product/buildr` verification 控制面、contract tests、审计工具和文档。错误收窄可能漏测，因此所有去重都要求反例和覆盖闭合；无法证明时保持现状。外部 API、持久数据、唯一 Candidate、tarball、Launcher 与 Release workflow 不变。

## 验收摘要

代表性普通变更能说明改动、owner、step 数和 Full 原因；慢 owner 的重复主证据得到去重或明确保留；日常 Core 不含 Release-only owner；最终报告能回答选择范围与 owner 成本谁占主导，并给出后续黄金路径清单和数学下限。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)

