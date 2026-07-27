## Context

当前 finish plan 在正式验证前有一个 task checkout 内的 `runtime-convergence`，用于保证最终候选的 runtime 投射可验证；集成和 push 后只有 `runtime-install` provider handoff。后者没有产品持有的影响判断，Agent 需要重新判断是否 sync retained Workspace、是否检查默认 CLI/Local App，以及应使用哪一个 checkout 的入口。

批次 4 关注的是交付后的本机收敛，不是再次验证候选。它必须发生在 `integration-push` 之后、cleanup 之前，并以 retained Workspace 为唯一 authority。

## Goals / Non-Goals

**Goals:**

- 产品根据已确认的 changed paths 生成 retained Workspace 收敛计划。
- 普通任务只运行 retained doctor；runtime 资产受影响时才 sync；默认 CLI 或 Local App 受影响时才交给现有安装 provider。
- 所有确定性命令使用 retained checkout 的绝对 CLI invocation 和绝对 target。
- 收敛失败只恢复本步骤及 cleanup 下游，不重复 Candidate、integration 或 push。

**Non-Goals:**

- 不重跑完整 Candidate 或 Workspace E2E。
- 不让 Buildr 猜测未提供的 changed paths，也不从 cwd 反推 retained Workspace。
- 不在本 Change 重写 CLI/Local App 安装器。
- 不建立常驻 daemon 或 Workspace 全局锁。

## Decisions

### 1. 保留候选前 runtime-convergence，新增交付后 retained-convergence

候选前步骤证明 task checkout 的最终实现和 runtime 一致；交付后步骤证明 retained checkout 已消费集成结果。二者 identity 和时间位置不同，不能用一个步骤混写。新步骤位于 `integration-push` 之后，`runtime-install` 与 cleanup 之前。

备选方案是把现有步骤整体移动到 push 后，但这样 Candidate 可能在 stale runtime 上运行，因此不采用。

### 2. changed paths 是影响判断 authority

Action Registry 要求 `retainedWorkspaceRoot`、retained `cliInvocation`、`agent` 与 `changedPaths`。分类规则保持窄且可测试：

- Rules、Skills、Components、Commands、package workspace targets、相关 manifests 命中 runtime sync。
- CLI 源码、bridge、bin、安装脚本命中默认 CLI handoff。
- Local App launcher/runtime 相关路径命中 Local App handoff。

未知 Product 路径不自动安装入口，但仍执行 doctor 并在 evidence 披露未分类路径。缺少 changed paths 时返回 input-required，不扫描 cwd 或整个 Git history。

### 3. 确定性收敛由产品执行，安装副作用继续由 provider 持有

`retained-convergence` 使用 retained 绝对 CLI 依次执行 doctor-before、按需 sync、doctor-after。`runtime-install` provider 消费其 impact evidence：没有 CLI/Local App 影响时返回 not-applicable；命中时才执行现有安装与身份检查。

这样避免把外部本机入口安装授权塞进通用 safe executor，同时让是否需要安装不再由 Agent 临时猜测。

### 4. evidence 明确记录执行与跳过

Registry plan 与 step evidence 保存 retained root/CLI identity 摘要、分类后的 impacts、未分类路径、实际 stages 和 skip reasons。doctor-after 必须 ready；sync 不适用时不伪造 sync result。相同 fingerprint resume 复用 passed step。

## Risks / Trade-offs

- [changed paths 不完整导致漏判] → integration provider 必须传递候选相对目标分支的完整路径；缺失时 input-required。
- [路径规则随产品结构演进] → 分类器集中实现并由 registry inventory/单元测试覆盖；未知路径进入 evidence。
- [retained checkout 在计划后变化] → root、CLI identity、target ref 与 changed paths 纳入 fingerprint；变化后本步骤 stale。
- [doctor-before 已 ready 仍运行] → 保留一次低成本只读检查作为真实 retained 基线，避免以 task checkout 状态代替主 Workspace。

## Migration Plan

1. 在 finish plan 中插入 `retained-convergence`，读取旧 run 时按现有兼容逻辑补入。
2. 新增影响分类和 registry resolver；旧 caller-supplied plan 继续兼容。
3. 更新 Task Finish Skill、当前认知与测试。
4. 集成后由 retained checkout sync/doctor；回滚时删除新步骤和 resolver，不改变既有 run evidence。

## Open Questions

无。
