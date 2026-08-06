# Task Finish 状态收敛到 SQLite

## 一句话摘要

保留Task Finish的名称、Skill、CLI和完整交付/清理职责，把其run、resume、lease与终态Result统一迁入Workspace SQLite，并在成功后删除Carrier和完整诊断等临时数据。

## 背景与问题

Task Finish已经是固定五阶段的产品执行器，但current run、completion和lease仍保存在`.buildr/task-finish`，与Task/Development/Review/Verification等SQLite current records形成两套本机状态协议。结果是恢复与终态读取依赖JSON配对，完整日志和失败现场长期累积，Local App、Doctor与清理边界也更复杂。

## 目标与非目标

目标是让SQLite成为Finish结构化状态的唯一authority，保留blocked/resume、target-race、Delivery Adaptation、remote readback、retained action、Doctor与Environment cleanup，并让成功终态只留下精简交付证明。非目标是不把Task Finish改名为Task complete，不把交付职责塞进Task Record，不建设历史平台、同步协议、Server/Cloud或长期双写。

## 受影响用户或角色

- 使用“收尾”交付正式Task的Agent与开发者。
- 通过Local App查看进行中或终态交付事实的用户。
- 维护Task Finish、Workspace SQLite、Task Environment、Doctor和自举runtime的Buildr维护者。

## 核心流程

Task Finish继续消费current Development handoff并运行五阶段。每个phase checkpoint与target lease写入SQLite；完整diagnostics和Delivery Carrier只放在run-owned transient root。delivery与Environment cleanup成功后，Finish清理自身临时数据，再以一个terminal mutation保存compact completion并完成Task Record。崩溃或清理失败时，只从SQLite current run恢复未完成动作。

## 关键变化

- 新增Finish run、completion、lease与transient metadata的SQLite窄表和事务边界。
- 删除`.buildr/task-finish`作为current authority；旧数据只做一次性可验证cutover。
- 成功后删除current checkpoint、lease、Carrier和完整日志，只留compact delivered evidence。
- CLI、Doctor、Terminal Delivery Application与Local App统一消费Task Finish Application read model。
- 保留`task-finish`；`task complete`只表示Task Record terminal transition。

## 影响、风险与兼容性

这是本机持久化协议的breaking切换。新runtime不双写也不长期读取旧协议；仅可复核的completed摘要会导入，其他legacy run从current Development/Git/remote/Environment事实重新建立。SQLite busy/corrupt会影响Finish，因此实现必须保持migration、transaction、integrity、writer provenance与bounded diagnostic边界。

## 验收摘要

正常完成后SQLite仅保留compact completion，且不存在current run、lease、Carrier、完整diagnostics或legacy Finish目录；blocked/resume只重做未完成阶段；Environment已cleaned的崩溃恢复不重跑交付；Local App/Doctor不扫描旧文件；Task Finish名称和职责保持不变。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [Task Finish execution spec](specs/task-finish-execution/spec.md)
- [Workspace Structured Store spec](specs/workspace-structured-data-store/spec.md)
- [Task Environment spec](specs/task-environments/spec.md)
- [Agent workflow spec](specs/agent-task-workflows/spec.md)
- [Local Workspace Application spec](specs/local-workspace-application/spec.md)
- [tasks.md](tasks.md)
