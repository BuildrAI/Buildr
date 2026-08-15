# 优化 Candidate 验证完整性与 CI 编排

## 一句话摘要

让 Buildr Candidate 对零测试选择失败关闭，消除 release Task 的重复 primary owner，并通过 bootstrap 与 Windows shard 重排缩短关键路径。

## 背景与问题

RC.12 Candidate Verify 的墙钟耗时为 7 分 55 秒，`workspace-windows` 是 374 秒的关键 Job；其内部七个 Workspace/Task owner在资源容量一条件下串行。Formal release Task 同时选择 full-scope `product.delivery` 与 required release artifact capability，五个 registry step重复执行。另有已删除测试目录仍被 npm glob引用，CI以零测试状态通过。

## 目标与非目标

目标是恢复验证失败语义、保持单一 primary evidence owner，并减少无效 runner setup、artifact dependency 与串行压力。非目标是删除跨平台、Host Node、Launcher、release smoke、Publish审批或Registry readback证明。

## 受影响角色

- Buildr 维护者：获得更可信且更快的 Candidate反馈。
- 执行正式 Task 的 Agent：只运行一个 required delivery capability，不再自动叠加同 owner的release专项。
- 发布操作者：继续使用稳定 `Candidate gate` 与既有 Publish控制面。

## 核心流程

Candidate 先在一个 bootstrap job中顺序完成 preflight 与artifact，再并行执行macOS core、Windows runtime、两个拆分后的Windows Workspace/Task shard、fresh build和Host Node tuples，最后由无项目依赖的轻量gate聚合closed evidence。

## 关键变化

- 测试文件集合为空时在runner启动前失败。
- release artifact capability改为独立可选诊断，普通交付由唯一required `product.delivery`覆盖。
- version-only package metadata走affected，其他package metadata保持full。
- Windows Workspace/Task owner拆为两个隔离runner，非消费者不下载artifact。
- gate移除`npm ci`但保持closed identity与coverage检查。

## 影响、风险与兼容性

空测试原先的假绿色将变为真实失败；这是有意收紧。Candidate shard内部名称和DAG改变，但稳定required check仍为`Candidate gate`。测试step identity、primary owner、平台与Host Node覆盖不减少。性能收益需在交付后用同tree多轮Actions timing确认。

## 验收摘要

- 空`node-test`/glob以非零状态结束，stale recovery owner被一致退役。
- package version-only计划不再full，依赖变化仍full。
-正式policy只有一个required delivery capability。
- 新shard并集与旧primary owner集合等价且无重复。
- aggregate可在没有`node_modules`的checkout运行并拒绝缺失、重复或漂移evidence。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
