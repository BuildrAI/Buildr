# 了解 Buildr

Buildr 组织项目资料、代码位置和可复用的工作方法。人表达目标、参与判断并验收；智能体（Agent）结合这些依据推进工作；Buildr Web 提供查看资料、进展和成果的入口。

它主要解决三件事：开始工作时少重复解释背景，换人或换工具后能够接续，把已经验证的方法留下来。具体执行仍在你使用的智能体（Agent）工具中。

## 从日常工作理解

| 你遇到的问题 | Buildr 提供的帮助 | 你仍需判断什么 |
| --- | --- | --- |
| 每次对话重新介绍项目 | 组织目标、资料和代码位置，供智能体（Agent）按需查找 | 资料是否准确，当前目标是什么 |
| 有经验，但只能靠个人记忆 | 用规则（Rule）表达边界，用技能（Skill）保存可复用方法 | 哪些经验值得沿用，适用于哪里 |
| 中断或交接后不知道做到哪了 | 保留任务（Task）目标、进展、结果与成果位置 | 实际成果是否满足目标 |
| 不想通读所有执行对话 | 通过 Buildr Web 查看项目资料与工作结果 | 哪些取舍需要参与，哪些结果可以接受 |

长期资料由个人或团队掌握。团队可以通过 Git 共享文件，但本机工作记录不会自动跨机器同步。智能体（Agent）接续时仍须读取当前内容，不能把旧对话当作最新事实。

## 当前可以做什么

- 登记工作空间（Workspace）、项目（Project）、服务（Service）和代码库实例（Repository Instance），连接业务目标与实现位置。
- 维护规则（Rule）、技能（Skill）及相关资源，并提供给受支持的工具。
- 保存任务（Task）目标、进展、关系和结果，按需进行审查（Review）、验证（Verification）、收尾与复盘。
- 在 Buildr Web 阅读和维护项目资料、技术图、代码地图（Code Map）及任务（Task）成果。

工具的支持范围与刷新方式见[适配参考](../../services/buildr/docs/agent-runtime-adapters.md)。支持接入表示有对应发现入口，不能代替对当前工具实际加载情况的核对。

## 使用边界

Buildr 当前以本机工作为主，没有完整企业权限、云端协作或跨机器自动同步。网页不托管智能体（Agent）对话，也不自动调度执行；完成记录不等于代码已推送或应用已更新。

文章和每日演进已有部分能力，扩展暂缓。前者整理稿件，后者按明确 Git 提交范围保存本机摘要；它们不构成核心使用的前置条件。具体操作与限制见[已知限制](../../services/buildr/docs/known-limitations.md)和[每日演进](flows/project-daily-progress.md)。

工作资料与本机记录的保存范围不同。需要更新或换机器时，请智能体（Agent）按[数据保全](guides/data-and-upgrades.md)核对并备份。

## 接下来读什么

[开始使用](guides/getting-started.md) → [日常使用](guides/usage.md)。想理解资料与代码的关系，读[项目、服务与代码库](architecture/project-service-repositories.md)；准备开发 Buildr，读[技术架构](architecture/technical.md)。

本页依据[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)与[核心规则](../../services/buildr/resources/workspace/AGENTS.md)。尚未实施的想法集中在[后续方向](directions.md)。
