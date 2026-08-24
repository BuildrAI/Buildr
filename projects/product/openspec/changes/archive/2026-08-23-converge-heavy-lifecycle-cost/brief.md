# 建立 Buildr Test Context 与层级并发验证体系

## 一句话摘要

在保持真实 CLI、Git、SQLite、Workspace、Finish 与 Release 主证据的前提下，为 Buildr 建立 runner-independent Test Context、不可变 seed、worker sandbox 和层级资源 grant，降低日常核心 Full 的重复生命周期成本。

## 背景与问题

任务二已经把日常核心 Full 与正式 Candidate/Release 重型验证分离，但 52-step Core 仍反复创建 Workspace、Git repository、SQLite、子进程和 cleanup 世界。现有 Task lifecycle System context 只能在单个 runner/owner范围复用；outer DAG 和inner test worker各自决定并发，资源竞争与尾延迟难以解释。

## 目标与非目标

目标是建立 test-only Context/Pool/Lease contract，以 Task 领域为首个分层迁移样板，并让outer scheduler向inner runner下发统一资源grant；通过多轮纯Core、focused和竞争压力证明成本、隔离与cleanup。

本次不迁移到Vitest/Jest，不删除没有替代primary owner的黄金旅程，不把Product test policy发布进npm package，也不改变正式Release artifact链。

## 受影响用户或角色

- Buildr维护者：获得更快且可解释的affected/Core反馈，并能按统一框架新增测试。
- 执行Task的Agent：减少普通交付等待，同时继续消费可信Verification Result。
- Release维护者：Candidate/Release主证据与唯一artifact身份保持不变。

## 核心流程

verification planner选择owner并计算预算；outer runner按Context key准备一次不可变seed；scheduler按层级容量向step发放grant；worker取得独立sandbox lease并运行最低充分边界测试；release验证seed identity、隔离和cleanup；timing evidence记录Context与资源等待；Candidate/Release继续使用原唯一执行图和artifact。

## 关键变化

- `test/context/`成为Buildr测试执行面的Context authority。
- registry新增Context、隔离/reset、并行安全与resource demand声明。
- Task领域测试按Component、Integration、System重新收敛主证据。
- 新增完整验证框架文档和术语/current knowledge入口。

## 影响、风险与兼容性

最大风险是共享seed污染、Component fake漂移和资源预算过度保守。实现通过tree identity、sandbox containment、真实Integration owner、同tree多轮计时和兼容helper控制风险。`node:test`入口、普通单文件执行、Candidate/Release membership与npm package保持兼容。

## 验收摘要

需要证明Context只准备一次、并发sandbox互不污染、inner worker不超过outer grant、Task primary evidence没有缺失或重复、纯Core多轮成本可复核、Full/affected竞争可等待并释放，以及Candidate/Release覆盖不减。180秒不可达时必须报告真实下限和residual。

## 实现结果

已在`test/context/`交付runner-independent Pool/Context/Sandbox Lease、`task-lifecycle/v1` provider与`node:test`薄adapter；verification scheduler现在按workers/processes/Git/workspace I/O产生exact grant，并与跨plan coordinated resource共同约束inner并发。Task terminal delivery的有界Application事实归位Component，真实SQLite/CLI/Git/Workspace/Finish/Release证据保持原边界。

三轮无竞争52-step Core均通过，墙钟为333.413s、337.109s、307.395s，中位333.413s；相对348.411s基线改善约4.3%。每轮只有一次Task Context prepare、14次跨runner reuse及49组隔离sandbox materialize/release。Core/affected竞争实测中两者均通过，Core的System Finish对`task-lifecycle-heavy`等待97.629s后取得并释放资源，证明等待与放大可解释。

180s目标尚未达到；Finish、Task Development、Finish delivery、Workspace/self-bootstrap仍是必要长尾。最终Candidate仍为66 steps，唯一tarball、Launcher/onboarding/smoke与独立Windows、Host Node、npm及Release readback责任未削弱。后续优化必须继续按primary evidence审计迁移新的provider或优化长尾内部实现，不能仅提高并发或换runner。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specification](specs/product-verification-quality/spec.md)
- [Implementation tasks](tasks.md)
