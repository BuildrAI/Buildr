## Context

Buildr Product 内部 registry 已能按 changed paths、step owner、依赖和资源生成 affected plan；Task Finish 也已能对冻结候选相对目标分支的 changed paths 匹配 `verification.yml` 中交付必需 capability。当前成本问题来自政策与概念混合：唯一必需能力 `product.candidate` 使用 `paths: ["**"]` 并固定运行 44 个 step；Project Testing metadata 又把 Quick、Task-affected、Candidate、Release 当作同一分类轴。首轮实现进一步增加 `product.task-affected + product.candidate` 两个重叠 required capability，无法解释也会重复执行。

最近一次正式 Candidate 耗时 350.004 秒；`integration-fast` 是必要但仍粗粒度的 System 主证据，Browser 五个 selector 则重复支付同一 Workspace、Local App server 和浏览器初始化成本。第一版应先删除重复执行和错误场景归属，不重写 runner/DAG。

## Goals / Non-Goals

**Goals:**

- 每个正式交付只通过一个 required capability，基于真实 changed paths 选择适用证据。
- affected 选择本身或跨域执行基础发生变化时，同一 plan 确定性扩展为 full，不再追加第二个 required capability。
- Quick、affected/full、Candidate/Release 分别表达成本、范围和验证目标/节点。
- Candidate 只组合必要 Candidate 事实；专项环境与 Release workflow 使用各自适用能力或场景。
- 删除无独立证明价值的重复 step/配置，保留有独立失败模式的测试案例和 focus 入口。
- 通过前后实测校准耗时，并让声明、registry、Skill、规则和文档保持一致。

**Non-Goals:**

- 不按“改动大小”、文件数量或风险分数自动判断。
- 不引入 P0.5 Candidate generation、Task 状态推进或新的 Verification Result 字段。
- 不建设通用测试 DSL、通用调度器、history/revision 或多 writer 协议。
- 不在本轮重写 `integration-fast` 全部领域测试，也不降低 Release 最终门禁。

## Decisions

### 1. 编排拆成成本、范围与验证目标

Quick 只是高频反馈的成本约束；affected/full 表示选择范围；Candidate/Release 表示被验证的冻结目标或生命周期节点。三者可以组合，例如开发工作树使用 `Quick + affected`，普通冻结 Candidate 使用 `affected`，明确完整回归的冻结 Candidate 使用 `full`。它们不得再作为每个 step 只能选一个或多个值的单一 taxonomy。

Registry 的 Project Testing metadata 只保留测试意图、执行边界、事实 owner、证明范围和目标成本。实际 Quick/full 组合继续由现有 `profiles` 表达，affected 选择继续由 `inputs` 表达；不再复制 `orchestrationScenarios`。

### 2. 正式交付只有一个 required capability

`product.delivery` 对所有 Product 变更适用且 `requiredForDelivery: true`，调用 `npm run test:changed -- --base origin/dev`。普通 changed paths 按 registry owner 选择 affected 证据；`verification.yml`、registry、planner、runner、Candidate wrapper 与 timing evidence 等选择/执行基础路径视为全局 owner，命中时同一 changed plan 直接选择完整 `candidate` profile。未映射路径继续 fail closed。

`product.full-regression` 调用现有 `npm run test:candidate`，但不作为每次交付自动门禁；它用于用户明确要求完整回归、发布准备或独立维护验证。这样既保留真实全量能力，也不产生 `delivery + candidate` 双 required 执行。

备选方案是新增风险评分、按文件数量判断，或让 Agent自由决定是否跳过证据。它们均不可审计，不采用。全局 owner 列表属于 Product registry policy，并由 contract test fail closed。

### 3. 显式完整回归按必要事实而非全部测试定义

完整 Candidate 必须覆盖全部登记为 `Candidate` 的主要事实 owner，但不是所有 Task-affected、Browser 或 Release 测试的并集。step 退出 Candidate 前必须满足其一：事实已有更强的 Candidate owner；该事实只在明确 changed paths 下适用；或它属于独立 Release 场景。

首轮迁移：

- 五个 `browser-*` registry step 删除。Browser 测试案例和 `test:browser:smoke` 保留，由条件化且交付必需的 `product.browser-smoke` 单独执行一次 `all` selector；Local App 未变化时不运行。
- `integration-candidate-release` 保留稳定 step/focus/group，但退出 Candidate，仅由 release 脚本变更的 Task-affected 或正式 Release 流程运行。
- `repository-onboarding` 保留稳定 step，但退出完整回归，仅在 installer、source checkout 相关变更时由 affected 选择，或由维护者显式 focus；发布物安装由更直接的 release tarball smoke 持有。
- package artifact、source/package CLI parity、release tarball smoke、Workspace/Runtime/OpenSpec 核心生命周期和并发 Task acceptance 仍是 Candidate 必要事实，继续保留。

Browser 的五类业务断言不是重复测试，不删除；重复的是五次 fixture/进程初始化及五个 Candidate step authority。`integration-fast` 暂不整体删除，因为其中仍有多个没有替代 owner 的公共 CLI 与生命周期事实。

### 4. 保持现有 authority，不给 Task Verification 增加 schema

Project registry 继续拥有内部 step 分类和组合；`verification.yml` 只暴露 `delivery`、`full-regression`、`browser-smoke` 等少量稳定能力。Task Verification 仍只选择、执行和记录能力事实；Candidate target identity 来自正式 Verification target，而不是 capability 名称。Finish 继续复用同一 Result Application，并按既有 path applicability 计算必需能力。

### 5. 兼容入口与验证方式

`npm test`、`test:changed`、`test:focus`、`test:candidate` 和既有 step id 保持兼容。删除的五个 Browser registry step 不再是 focus selector；已有 `test:browser:<selector>` npm 入口继续用于诊断。Release checklist 保留专项命令，并明确这些命令不属于每个 Product Candidate。

实现先用 planner contract 覆盖单一 required capability、全局 owner 扩展、完整回归 membership 和 Browser 单次 owner，再运行本 Change 的 delivery plan；本 Change 修改 registry/policy，因此该 plan 自身必须确定性扩展为完整回归。contract 必须证明 `test:candidate` 使用同一完整 profile；delivery 已实际覆盖 full 时不得为了入口名称再重复执行同一回归。

## Risks / Trade-offs

- [affected input 映射遗漏会少选测试] → 未映射路径继续 fail closed；registry、planner、changed-path collector 和执行器自身变化由同一 plan 强制扩展为 full。
- [固定 `origin/dev` 不适合其他 Project] → 该 invocation 只属于 Buildr Product，其集成分支当前明确为 `dev`；不进入通用 Task Verification schema。
- [Browser 从 Candidate 移出后 UI 回归频率下降] → Local App 路径命中时 `product.browser-smoke` 改为交付必需，并一次运行全部 Browser case；非 UI 任务不承担 Chrome 成本。
- [Release 专项不再被普通 Candidate 顺带覆盖] → 保留稳定 focus/group 与 Release checklist；相关脚本变更由 affected 自动选中，正式 Release 仍显式运行。
- [一次优化无法解决 `integration-fast` 粗粒度] → 保留其必要事实，本轮仅记录后续按 owner 拆分的实践问题，不以删覆盖换耗时。

## Migration Plan

1. 先用 contract tests 固化单一 required capability、全局 owner 扩展和完整回归 membership。
2. 更新 registry 与 `verification.yml`，删除无 consumer 的 Browser 内部 resource/group 配置。
3. 同步 Skill、Product 规则、测试实践、release checklist 和 current knowledge。
4. 运行 Quick、代表性 affected/full plans、Browser capability、Release focus 与显式完整回归，读取 timing summary。
5. 若新的 affected/full 选择缺失必要 owner、出现未映射路径或实测无收益，回退本 Change 的 membership/声明修改，不保留双政策。

## Open Questions

无。`integration-fast` 的进一步领域拆分由后续实测迭代决定，不阻塞本轮。
