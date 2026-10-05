# Buildr 阅读目录

从当前问题找到需要的资料。默认从下面三篇按需进入；开发、维护和接口细节不是使用前的必读内容。

## 从哪里开始

| 你的问题 | 阅读 |
| --- | --- |
| Buildr 解决什么问题，能为我留下什么？ | [了解 Buildr](overview.md)：用途、协作方式与当前边界。 |
| 怎样安装、配置并开始工作，怎样判断完成？ | [开始使用](guides/getting-started.md)：安装引导、日常工作、更新与恢复。 |
| 工作空间（Workspace）、项目（Project）、服务（Service）和代码库（Repository）怎样关联？ | [工作对象与协作](architecture/project-service-repositories.md)：用业务目标找到实现与代码。 |

遇到不熟悉的名称，查[术语表](glossary.md)；判断平台、数据或协作条件，查[当前使用边界](../../services/buildr/docs/known-limitations.md)。

## 按目的继续阅读

| 你要解决的问题 | 按需参考 |
| --- | --- |
| 怎样接续工作、判断成果并保留方法？ | [从讨论到交付](architecture/task-system.md) · [技能（Skill）体系](architecture/buildr-skill-system.md) · [知识维护](architecture/knowledge-maintenance.md) |
| 系统怎样组成，代码和数据由谁维护？ | [技术架构](architecture/technical.md) · [代码地图（Code Map）](../code-map/README.md) · [数据设计](architecture/buildr-data-design.md) · [数据库表](architecture/buildr-database-tables.md) |
| 怎样准备开发并验证实际改动？ | [产品开发入口](../../README.md) · [贡献指南](../../../../CONTRIBUTING.md) · [项目测试与验证](architecture/workspace-testing-and-verification-framework.md) · [产品验证框架](architecture/verification-framework.md) |
| 怎样查命令、数据格式与扩展约定？ | [命令参考](../../services/buildr/docs/cli-reference.md) · [公开数据格式](reference/json-contracts.md) · [工具适配开发](reference/agent-runtime-adapter-contribution.md) · [能力契约（Capability Contract）](../../services/buildr/docs/skill-capability-contracts.md) |
| 怎样恢复安装、维护版本或发布产品？ | [安装、更新与恢复](guides/getting-started.md) · [发布流程](flows/open-source-release.md) · [版本记录](../../../../CHANGELOG.md) |
| Buildr 如何看待长期工作积累？ | [工作基础设施](../../docs/publications/buildr-agent-work-infrastructure.md) · [更多、更好的工作](../../docs/publications/buildr-agent-more-and-better.md) |

[首版准备审查](../reviews/v0.1.0-readiness.md)保留当时的检查依据，不作为当前使用说明或发布完成证明。涉及漏洞请使用[安全报告](../../../../SECURITY.md)入口。

## 查找与接着读

Buildr 提供两个相互连接的阅读入口，重合的正文只维护一份：

- **主题阅读**：从问题和关系理解项目（Project），连接说明、技术图（Technical Diagram）与代码地图（Code Map）。仓库内按本页问题进入，需要关系图时查[技术图](../code-map/README.md#按问题找图)。
- **文档目录**：查找当前范围内可发现的普通 Markdown 资料，包含主题阅读中的文字说明，也包含安装、开发和专项参考。未编排资料仍可从“其他文档”找到；补充阅读仍可搜索并计数。

两者并非互相包含：交互图从主题阅读进入，普通参考资料不必各建一个主题。规范（Specification）、规则（Rule）和技能（Skill）有各自用途与入口，不计入普通文档数量。文档数量按当前可读取的资料范围统计，不是仓库全部文件数。

搜索覆盖当前阅读方式的标题、摘要和路径等目录信息，**不检索正文全文**。GitHub 中可沿本页链接查正文，交互图需在 Buildr 或支持 HTML 的环境打开。

## 开发参考

开发从[产品开发入口](../../README.md)开始。准备与检查以产品目录的 [`preparation.yml`](../../preparation.yml)、[`verification.yml`](../../verification.yml)为准；具体运行和构建命令查所属服务（Service）的入口：[Buildr 主包](../../services/buildr/package.json)、[Buildr Web 前端](../../services/buildr-web/package.json)或 [DSH 桌面插件](../../services/dsh-plugin/package.json)。DSH 插件独立构建和发布；避免在多篇说明中抄写命令。

专项问题按需查阅：[智能体（Agent）工具支持](../../services/buildr/docs/agent-runtime-adapters.md)、[命令架构](../../services/buildr/docs/cli-architecture.md)、[Archify 组件（Component）](../../services/buildr/docs/archify-component.md)、[OpenSpec 协作](architecture/task-system.md#openspec-变更怎样推进)和[每日演进](flows/project-daily-progress.md)。

人和智能体（Agent）使用同一份事实来源：正文解释目标、关系和理由，行为约定查[正式规范](../../openspec/specs/)，操作细节查当前命令帮助和对应接口。智能体（Agent）的授权与执行约束来自适用的 `AGENTS.md` 和技能（Skill）；本目录不另写一套执行规则。普通说明在原处维护，历史通过 Git 查找；服务（Service）内参考保留原位置，不为阅读入口复制正文。
