# Buildr Product 当前认知

本文是 Buildr Product 已实现当前事实的入口。产品定位和解释见 [Buildr Product](../../docs/buildr-product.md)，规范行为以 [canonical specs](../specs/) 和 active Change delta specs 为准。

## 当前产品

Buildr 是 Agent-first 的工作基础设施：治理适合长期复用的工作事实与工作方法，为 Agent 提供可发现入口、runtime 投射、确定性状态变更、完整性保护和诊断。Agent 仍负责理解目标、发现信息、形成 Task Context、推理并执行专业任务；人负责目标、业务判断、授权和重要决策。

当前默认层级为 `Organization/Root → Project → Service`。Workspace 是工作范围与发现入口；其中只有被明确组织、登记或纳入治理的长期事实与方法才是 Buildr Work Assets。

## 当前能力入口

- Workspace、Project、Service：由 manifests/registries 表达稳定 identity、关系和 source ownership。
- Rules、Skills、Commands、Components：由 workspace manifests 治理并按 runtime adapter 投射。
- OpenSpec：在 Product Project 管理 proposal、design、delta specs、tasks、contract baseline 和 active/archive lifecycle。
- Project Testing：`project-testing` 以无状态指导帮助 Agent 按真实技术栈设计、开发和编排 Project / Service 测试；不创建 Result、Receipt、Application 或 provider contract。测试入口稳定后，才由 Task Verification 消费 Project declaration。
- Task workflow：正式持久交付在首次写入前通过`task-manager`创建或恢复canonical Task Record，再由`task-environment`按同一Task ID准备实际执行根与cleanup authority。`task-development`从首个proposal、方案或直接实现等正式研发动作开始维护planning snapshot；研发节点可以不存在、not-applicable或由明确授权waived，存在时只引用专业authority的portable target与identity。内容稳定后Development观察Content Target、形成verification policy并消费formal Task Verification；随后独占Task Candidate/generation、Completion Review gate、`proceed / blocked`、精确风险/豁免授权与不可变Finish handoff。`task-finish`只消费current handoff并交付、清理，不收敛Change、修改内容、运行formal Verification、生成Candidate或接受风险。各专业模块不把内容复制进Task Record或Development Receipt。
- Local App：以 Workspace 为全局目录，提供 Project、Service 和 Task Record 的理解与受控操作入口；Task 是 Change 的唯一人类入口。Task 概览优先逐项展示已保存 Change 引用的 Brief，并通过一次只读 SQLite 联表查询展示 Task 与各专业 current 的最小摘要，不建立聚合 store 或第二 writer；没有关联真实 Task 的 Change 不在 Local App 处理。页面不创建、关联、修改、继续、审查、同步或归档 Change，Change lifecycle 仍交给 Agent/对应模块。“研发”直接读取 Task Development 保存的 Receipt/applicability，“证据”分别读取两个 Review Result 槽位与一个 Verification Result，“环境”读取 Environment current，“复盘”读取 Retrospective current；terminal delivery只消费Finish run/completion与Development handoff的保存关联。全部 GET 都不重新观察 Git、文件、declaration、Environment provider 或 transient Finish artifacts。人可以管理 Task Record，但页面不提供 Development mutation、Environment prepare/cleanup、Review/Verification 执行或 Result writer。

## 当前认知导航

- [术语表](glossary.md)
- [架构入口](architecture/index.md)
- [产品架构](architecture/product.md)
- [技术架构](architecture/technical.md)
- [OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)
- [Buildr Service](services/buildr.md)
- [Buildr Web Service](services/buildr-web.md)

既有 `task-boards/` 与 `task-cockpits/` 都是原地保留的历史任务页面，只能作为历史旁证；它们不再被创建或维护，也不替代 Task/Parent、各专业 current records、current knowledge、canonical specs、active Change、实现或验证 evidence。
