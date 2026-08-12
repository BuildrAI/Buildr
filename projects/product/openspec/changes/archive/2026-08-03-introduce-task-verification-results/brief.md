# P0.4 Task Verification Result

一句话摘要：把 Project 已有验证能力的声明与执行结果分开，为每个正式 Task 建立一份可移植、可 Git 跟踪、可判断新鲜度的 current Verification Result。

## 背景与问题

现有 Task Verification 已能读取 `verification.yml`、执行命令、协调资源并产生 transient evidence，但 v2 同时承载三层 assurance、Candidate identity、Finish reuse 和重试语义，且没有正式 Task current Result。CLI、Finish 与未来 Local App 因而没有同一个可持久消费的验证事实。

## 目标与非目标

目标是以一个 Application 独占 current Result，绑定 target 与 Project declaration identities，原子整值替换并由 reader 派生 current/stale/unknown；同时把 Project declaration 收窄为已有能力事实，把完整输出保留为 transient execution。

不实现 Result history/CAS、多 writer、测试开发平台、Task Development、Candidate generation、Task 推进、风险接受、Metadata Publication 或新 Finish 状态机。

## 受影响用户与角色

- Agent：按 Task Intent 与 Project declaration 选择已有能力、执行并提炼事实。
- 用户与未来 Task Development：消费 Result 与 coverage gap，自行决定是否继续。
- Buildr Product/Local App/Finish：只通过同一 Application 读取或补齐 current Result。

## 核心流程

1. 读取正式 Task、明确 target identity，并 inspect existing Result。
2. 读取 Task scope 内 Project `verification.yml` v2，选择适用已有能力；没有能力只报告 gap。
3. command runner 或 bounded Agent operation 产生 transient execution evidence。
4. Agent 形成完整 facts 与 passed/not-passed conclusion，经 Application 原子替换 current。
5. reader 比较当前 target/declarations 派生 applicability；Local App 与 Finish 复用同一 read model。

## 关键变化

- `buildr.task-verification/v3` 与 `buildr.project-verification/v2` 直接替换旧版本。
- 新增 `.buildr/tasks/<task-id>/verification.yml` 与 `task verification inspect|record`。
- `verification run` 改为显式 capabilities 的 transient execution。
- Local App 增加 Task Verification 只读页签；Finish 删除独立 assurance summary consumer。
- 删除 minimal/affected/candidate、maturity、requiredAssurance、Candidate reuse 与 proceed/blocked authority。

## 影响、风险与兼容性

这是破坏性 schema/contract 切换；旧 Project v1 declaration 会由 doctor 明确拒绝，不维护双 reader。Local App 不知道 current target 时只显示 unknown；Finish 仅能自动选择声明式、delivery-required command capabilities，复杂语义仍由 Agent 处理。

## 验收摘要

- Result closed schema、portable、Git-trackable、唯一 writer/reader、原子替换与 rollback。
- target/declaration 变化可解释地 stale；缺 target 为 unknown。
- execution 中断或写入失败不覆盖 current；完整 raw output 不进入 Result。
- CLI、Skill、Local App、Finish 与 installed package 复用同一 Application。
- canonical specs/docs/knowledge/Roadmap 无旧 authority，Product focused/Fast/Candidate 验证通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Tasks](tasks.md)
