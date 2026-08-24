## Context

当前 `registry.mjs` 同时保存 step 执行定义、profile/DAG/resource 关系、路径 owner、全局 Full 输入和若干 metadata 例外。Changed planner 因此只能按“文件是否命中中央 authority”粗粒度决定 Full；尤其 `registry.mjs` 与 `timing/**` 的机械维护会提升为完整 Candidate。另一方面，planner 已能报告 `unmapped` 和 `productionOwnerGaps`，却又把它们合并为 Full fallback，违背 canonical spec 已有的 fail-closed 要求。

计划预算目前只在执行后比较实际 wall-clock 与声明值。当前 Candidate step 目标耗时之和及资源约束已经证明 120 秒总预算不可行，但 runner 仍会先执行完整集合再输出 warning。

## Goals / Non-Goals

**Goals:**

- 建立独立的路径 ownership authority，让 owner 映射维护与执行图语义变化具有不同的 changed 选择结果。
- owner gap 在启动 admission 或业务 verifier 前返回结构化 closed diagnostic。
- 计划在执行前计算并展示总工作量、依赖关键路径、全局容量下限、资源容量下限和总预算可行性。
- 用稳定反例覆盖 owner-only、timing/report-only、执行语义、package metadata 与未知路径。

**Non-Goals:**

- 不在本 Change 拆分日常 Core Full 与 Release heavy lane。
- 不重构 Task/Workspace lifecycle fixture 或提高全局并发。
- 不改变 installed Project 的 Task Verification schema、Result authority 或正式 Release artifact 链。

## Decisions

### 1. 路径 ownership 与 execution graph 使用独立模块

新增 `test/verification/ownership.mjs` 作为 Product changed selection 的路径 authority，保存 per-step inputs/exclusions、ignored/delegated/governed inputs、production owner allowlist 与语义化 Full 输入。`registry.mjs` 继续拥有 step command、profile、dependency、resource、budget、timeout 与 Candidate membership，并在组装时按 step id 取得 ownership。

这样修改 ownership module 本身只运行 verification admission、registry contract 与受影响的新 owner；修改 registry、planner、scheduler、executor、profile、dependency 或 resource 仍命中 execution semantics Full。相比对 `registry.mjs` 做内容 diff，这一结构不依赖易漂移的文本启发式。

### 2. Full 只接受明确的执行语义理由

Full scope reasons 使用闭合 code，例如 `execution-authority-change`、`dependency-graph-change`、`runtime-toolchain-change`、`package-execution-metadata-change`。`verification.yml`、package metadata 和 timing 资产在能取得 base/current 内容时由专门分类器判断；无法解析或无法证明安全子集时保守 Full。

owner-only 与 report/budget-only 变化通过 ownership owner 选择 affected。`registry.mjs` 不再承担 owner 映射，因此它保留 Full 不会惩罚机械 owner 维护。

### 3. owner gap 是选择错误，不是验证 profile

Planner 在完成路径审计后先形成 `selectionDiagnostic`。只要存在 unmapped path 或 production owner gap，就返回 blocked plan，包含所有路径、已发现 broad owners、诊断 code 和补 owner 的 next action；不追加 Candidate steps，也不运行 admission。`--plan` 和 `--json` 仍输出该诊断并以非零状态退出，便于 CI 和 Agent 消费。

显式风险接受属于 Task Development，不进入 test-only planner；本 Change 只保留可移植 diagnostic 输入，不新增 planner waiver。

### 4. 预算准入使用三个确定性下限

对最终 DAG 和选定 execution profile 计算：

- `globalCapacityLowerBoundMs = ceil(sum(step budgetMs) / global capacity)`；
- `dependencyCriticalPathMs`：按拓扑计算最长依赖链目标耗时；
- 每个协调资源的 `resourceCapacityLowerBoundMs = ceil(sum(claiming step budgetMs) / resource capacity)`。

`minimumFeasibleDurationMs` 取以上约束最大值。计划同时报告 step count、totalTargetDurationMs、各下限、限制性约束、declaredBudgetMs 与 `feasible`。存在无预算 step 时明确报告 coverage，而不是按零成本伪装可行。

当前重型 Candidate 在 Core/Release 尚未拆分前将总预算调整为基于真实观测的诚实过渡值；预算仍是非阻断实际性能目标，但“声明值低于理论下限”属于执行前的声明错误并 fail closed。

### 5. 保持一个 planner 输出形态

Changed、Candidate 与 focus 继续复用同一 planner。公共 plan 投影增加 `status`、`diagnostic` 与 `estimate`，而不是建立第二套预算工具；执行器只接受 `status: ready` 且预算声明可行的 plan。

## Risks / Trade-offs

- [Risk] 大规模移动 inputs 容易遗漏 step owner → 迁移测试比较迁移前后全部 step 的 inputs/exclusions、Candidate membership、依赖和命令 identity，并运行历史路径回放。
- [Risk] 目标预算不是实际调度时长，可能高估或低估 → 下限只判断数学可行性，不承诺 wall-clock；实际 timing 继续独立记录并用于校准。
- [Risk] owner gap fail closed 会让既有未知路径任务立即失败 → diagnostic 一次列出全部 gap 和 owner 修复入口，避免逐个修复；不提供 Full fallback。
- [Risk] 临时调高 Candidate 总预算可能弱化性能压力 → 在结果中标记为 Core/Release 分离前的诚实过渡值，后续 Parent Contribution 仍以 Core Full 180 秒目标重新收敛。
