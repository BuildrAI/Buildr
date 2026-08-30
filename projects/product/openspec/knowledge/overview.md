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
- Task workflow：正式持久交付在首次写入前通过`task-manager`创建或恢复canonical Task Record，再由`task-environment`按同一Task ID准备实际执行根与cleanup authority。Parent只为能独立形成Candidate、Verification、Completion、不可变Handoff与Delivery的Contribution创建Child；普通调查、编码、测试或Agent并行分工不因协作本身强制建Child。任务 guidance 按 next executable action 分阶段装配 Skill/contract/provider；首次修改前只建立一次有界 authority source map，后续按 scope 或事实变化增量刷新。Project Declaration Intake将已确认、未改变scope、适用性、requiredness、capability、外部效果、安全例外或authority的差异分类为routine maintenance并交给专业owner维护；上述长期语义变化或证据冲突才请求用户做精确决定。`task-development`从首个proposal、方案或直接实现等正式研发动作开始维护planning snapshot；研发节点可以不存在、not-applicable或由明确授权waived，存在时只引用专业authority的portable target与identity。内容稳定后Development观察Content Target、形成verification policy并消费formal Task Verification；随后独占Task Candidate/generation、Completion Review gate、`proceed / blocked`、精确风险/豁免授权与不可变Finish handoff。`task-finish`只消费current handoff并交付、清理，不收敛Change、修改内容、运行formal Verification、生成Candidate或接受风险。各专业模块不把内容复制进Task Record或Development Receipt；效率指标只供 Task Retrospective 跟踪、评估和优化，用户或团队给出的耗时区间只作为当前复杂度下的解释背景。这些事实不形成新的 Result、gate 或进度 authority，也不构成通用阈值或自动验证范围决策。
- 项目每日演进：每个已登记 Project 按本机日历日保存 Git 提交驱动的四问摘要，权威是被 Git 忽略的 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。Agent 先同步最新代码，再收集当日提交与更改文件、对比 `git config user.email` 后写入；自己的提交可挂 0..N 个本机 Task，他人提交禁止挂 Task。Buildr Web 在项目详情「每日演进」Tab 只读展示。它不是当前认知、Task Record 或跨机器共享数据；产品读取路径不扫描 Git，也不内置 cron。
- Buildr Web：以 Workspace 为全局目录，提供 Project、Service 和 Task Record 的理解与受控操作入口；Task 是 Change 的唯一人类入口。Task 概览先通过一次只读 SQLite 联表查询，把已保存专业current facts派生为目标、Delivery、Activation、Cleanup、局部attention与具名authorization用户摘要，再按需展示技术事实；各结果保持正交，不建立聚合store或第二writer。页面继续逐项展示已保存Change引用的Brief；没有关联真实Task的Change不在Buildr Web处理。页面不创建、关联、修改、继续、审查、同步或归档 Change，Change lifecycle 仍交给 Agent/对应模块。“研发”直接读取 Task Development 保存的 Receipt/applicability，“证据”分别读取两个 Review Result 槽位与一个 Verification Result，“环境”读取 Environment current，“复盘”读取 Retrospective current；普通完成投影以任务记录为准，不要求旧收尾关联；有匹配历史证据时才投影机器验证的交付。全部 GET 都不重新观察 Git、文件、declaration、Environment provider 或 transient Finish artifacts。人可以管理 Task Record，但页面不提供 Development mutation、Environment prepare/cleanup、Review/Verification 执行或 Result writer。
- 发布与安装：一份可摘要比较的 Buildr Application Payload 进入完整 npm package；npm Registry 是唯一正式二进制分发 authority，Buildr 主进程使用兼容Host Node。发布Task的Environment可在Finish后清理，publication只按冻结commit、Task Environment Receipt与Buildr Service preparation recipe重建；精确Node executable和其bin-first PATH共同冻结。用户显式执行`buildr web launcher install`后，macOS `.app`或Windows Start Menu shortcut只保存已验证binding并执行同一npm Buildr的`web`命令，不形成第二安装或更新渠道。GitHub Release只保留版本说明，Actions artifact只保存冻结候选和closed release transaction evidence，不形成Task Record旁路store。

## 当前认知导航

- [任务收尾：参与者、动作与边界](flows/task-closeout.md)

- [术语表](glossary.md)
- [架构入口](architecture/index.md)
- [产品架构](architecture/product.md)
- [技术架构](architecture/technical.md)
- [项目每日演进](flows/project-daily-progress.md)
- [OpenSpec Change 生命周期](flows/openspec-change-lifecycle.md)
- [Buildr npm 发布流程](flows/open-source-release.md)
- [Buildr Service](services/buildr.md)
- [Buildr Web Frontend Service](services/buildr-web.md)

既有 `task-boards/` 与 `task-cockpits/` 都是原地保留的历史任务页面，只能作为历史旁证；它们不再被创建或维护，也不替代 Task/Parent、各专业 current records、current knowledge、canonical specs、active Change、实现或验证 evidence。
