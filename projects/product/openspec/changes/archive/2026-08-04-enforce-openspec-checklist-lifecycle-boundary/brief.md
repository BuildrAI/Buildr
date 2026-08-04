# 收敛 OpenSpec checklist 生命周期边界

## 一句话摘要

OpenSpec Change checklist 只记录归档前可完成的 Change-owned 工作，`buildr openspec converge` 对未完成项关闭式失败，归档后的 Task lifecycle evidence继续由各专业 writer 与 Metadata Publication负责。

## 背景与问题

P0.8 已把 convergence/archive 从 Task Finish 移到 Task Development 观察 stable Content Target 之前，但当前 OpenSpec apply contribution仍保留旧 authority。此前 Change把Formal Development、Finish、retained activation和terminal state写入`tasks.md`，导致Change先归档、后续动作虽有正式证据却只能留下冻结的`9/13`。

同时，`buildr openspec converge` 使用非交互`openspec archive --yes --skip-specs`，没有在产品侧拒绝未完成checkbox，因此旧计划边界不会被及时发现。

## 目标

- 在任何canonical或archive写入前阻断未完成checklist。
- 让OpenSpec propose/update/apply contribution明确pre-disposition checklist边界。
- 删除Task Finish convergence/archive旧authority并增加负向验证。
- 保持历史archive与Metadata Publication边界不变。

## 非目标

- 不倒写历史archived Change。
- 不为checklist增加schema、分类字段或第二份进度store。
- 不让Task Development contract硬依赖OpenSpec。
- 不让Metadata Publication发布或解释`tasks.md`、Environment或Finish evidence。

## 受影响用户或角色

- 使用OpenSpec规划和实现Change的Agent。
- 依赖`buildr openspec converge`执行确定性canonical sync/archive的Buildr维护者。
- 通过Local App或Git查看Change进度与正式Task records的人。

## 核心流程

1. propose/update只生成归档前可完成的Change tasks。
2. apply完成实现、current knowledge和直接验证反馈，勾完全部Change-owned项。
3. converge先检查checklist；存在未完成项时零写入并返回精确进度。
4. checklist闭合后执行deterministic sync/archive。
5. archive后由Task Development、Review、Verification、Finish、Environment、Task Manager继续各自生命周期；Metadata Publication只发布eligible Task records。

## 关键变化

- 新增`change-checklist-incomplete`阻断结果。
- OpenSpec Component contributions禁止post-archive lifecycle checkbox。
- 修复“Task Finish执行convergence/archive”的旧文案和对应测试盲区。

## 影响、风险与兼容性

未完成checklist的既有active Change会从“带警告仍可归档”变为正式blocked，这是预期的关闭式兼容变化。Agent需要完成真实任务，或在归档前修订错误的checklist边界；Buildr不会自动勾选、删除或解释任务。历史archive不迁移。

## 验收摘要

- 未完成checklist时canonical、receipt、archive均零变化。
- 完成checklist后现有convergence journey保持通过。
- package/workspace/runtime contribution不再包含Task Finish convergence旧authority。
- Metadata Publication contract与exact owned paths不变。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [OpenSpec deterministic sync delta](specs/openspec-deterministic-sync/spec.md)
- [Agent task workflows delta](specs/agent-task-workflows/spec.md)
- [Buildr package assets delta](specs/buildr-package-assets/spec.md)
