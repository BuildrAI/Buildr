# Buildr Product 当前认知

本文是 Buildr Product 已实现当前事实的入口。产品定位和解释见 [Buildr Product](../../docs/buildr-product.md)，规范行为以 [canonical specs](../specs/) 和 active Change delta specs 为准。

## 当前产品

Buildr 是 Agent-first 的工作基础设施：治理适合长期复用的工作事实与工作方法，为 Agent 提供可发现入口、runtime 投射、确定性状态变更、完整性保护和诊断。Agent 仍负责理解目标、发现信息、形成 Task Context、推理并执行专业任务；人负责目标、业务判断、授权和重要决策。

当前默认层级为 `Organization/Root → Project → Service`。Workspace 是工作范围与发现入口；其中只有被明确组织、登记或纳入治理的长期事实与方法才是 Buildr Work Assets。

## 当前能力入口

- Workspace、Project、Service：由 manifests/registries 表达稳定 identity、关系和 source ownership。
- Rules、Skills、Commands、Components：由 workspace manifests 治理并按 runtime adapter 投射。
- OpenSpec：在 Product Project 管理 proposal、design、delta specs、tasks、contract baseline 和 active/archive lifecycle。
- Project Testing：`project-testing` 以无状态指导帮助 Agent 按真实技术栈建设后端单元/本地功能/环境冒烟及前端静态/单元/组件/Browser功能/环境冒烟测试。`verification.yml`只保存测试体系地图；开发中Agent直接运行测试，开发完成后Task Verification Application只保存有意义验证报告。
- Task workflow：正式持久交付在首次写入前通过`task-manager`创建或恢复canonical Task Record；Agent依据当前目标和现场按需使用`task-environment`、`task-development`、`task-review`、`task-verification`、`task-finish`或父子管理Skill。Buildr不再提供统一`task next`入口，也不把Development Receipt、Candidate或Handoff当成其他专业模块的准入条件。各Application只维护自身事实与动作安全，Agent在每次动作前重新读取真实代码、文件、Git、外部系统和对应专业结果。
- 项目每日演进：每个已登记 Project 按本机日历日保存 Git 提交驱动的四问摘要，权威是被 Git 忽略的 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。Agent 先同步最新代码，再收集当日提交与更改文件、对比 `git config user.email` 后写入；自己的提交可挂 0..N 个本机 Task，他人提交禁止挂 Task。Buildr Web 在项目详情「每日演进」Tab 只读展示。它不是当前认知、Task Record 或跨机器共享数据；产品读取路径不扫描 Git，也不内置 cron。
- Buildr Web：Task概览、研发、审查、验证、环境和历史交付分别读取所属read model；“证据”只展示Review Result与Task Verification Report。页面不组合统一推进状态，不执行测试或写专业报告，也不提供Task Execution Record浏览器。
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
