# 优化日常开发的重型验证性能

## 摘要

按真实领域拆分Buildr的Integration/System重型验证owner，让affected开发反馈只运行直接相关测试，同时保持Candidate完整覆盖、稳定identity与无重复执行。

## 背景与问题

Fast已经稳定在秒级，但普通Integration、Verification System、Workspace System和Task Finish仍包含多个变化频率与生命周期不同的领域。小范围修改因此会启动无关重型文件。任务二正式验证全部通过时出现13条预算warning，它们提供了聚合长尾和共享runner放大的线索，但本任务的重点是日常affected性能，不是消除warning数量。

## 目标与非目标

- 目标：收窄affected重型DAG、保持测试文件唯一owner、完整Candidate覆盖和可解释预算。
- 非目标：不删除测试、不降低Scenario、不修改`verification.yml`，不改变Candidate runner、tarball、gate或branch protection。

## 受影响用户或角色

- Buildr维护者与Agent：普通领域改动更快获得直接反馈，可按owner独立定位。
- 发布维护者：Candidate继续运行全部行为文件并使用相同平台与gate。

## 核心流程

Changed planner先运行Fast和适用admission，再只选择直接领域owner；focus用于同树计时与定位。Candidate仍聚合全部primary owner，每个Integration/System文件恰好执行一次。OpenSpec收敛、归档与目标冻结后只执行一次正式交付验证。

## 关键变化

- Integration覆盖Task、声明、OpenSpec、验证编排、Runtime、发布、数据存储等领域切片。
- Verification System分离planner/编排、公共JSON和OpenSpec；Workspace System分离Project/Service、Task lifecycle和Worktree；Task Finish分离CLI与产品Journey。
- 用代表changed-plan基线和两轮focused计时验收性能；13条warning只用于结构判断和预算校准。

## 影响、风险与兼容性

新增owner identity会增加registry/CI列表和少量Candidate进程启动开销，但stable ID、行为文件并集与执行入口保持兼容。输入映射与Candidate覆盖由启动重型executor前的contract fail closed保护。

## 验收摘要

- 代表领域路径只选择直接重型owner并排除无关sibling。
- Integration/System拆分前后文件并集相同、无交集、Candidate/CI覆盖完整。
- 新增或显著改变的owner有同树两轮focused成功计时和独立预算依据。
- 最终稳定目标只执行一次正式交付验证。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specification](specs/product-verification-quality/spec.md)
- [Implementation tasks](tasks.md)
