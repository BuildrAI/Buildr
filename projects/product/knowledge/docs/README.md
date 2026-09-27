# Buildr 使用与开发手册

这份手册帮助你按目标找到使用指南、协作方式、实现说明与接口参考。它与[主题阅读](../README.md)共用已有正文；想先理解产品的用途、价值和方向，可以从[Buildr 整体认识](overview.md)开始。

## 从哪里开始

- **开始使用**：读[使用指南](guides/getting-started.md)，让智能体（Agent）安装并介绍基本概念，在 Buildr 配置好工作空间（Workspace），再到智能体（Agent）工具中开始工作。日常接续、交付、更新和排障也在同一篇。
- **理解协作**：读[项目、服务与代码库如何协作](architecture/project-service-repositories.md)，再看[从讨论到交付](architecture/task-system.md)，了解工作如何组织、成果如何留下。
- **参与开发**：先看[贡献指南](https://github.com/BuildrAI/Buildr/blob/main/CONTRIBUTING.md)，再用[代码全景与定位指南](../code-map/README.md)找到实现位置，按[产品验证框架](architecture/verification-framework.md)选择检查。

## 按目的继续阅读

目录分为七章。每章先读说明，再按需进入参考；图示依据、其他语言版本等放在补充阅读中。

| 阅读章节 | 解决什么问题 | 主要入口 |
| --- | --- | --- |
| 了解与上手 | Buildr 适合什么工作，怎样开始，当前有哪些边界？ | [使用指南](guides/getting-started.md) · [核心术语](glossary.md) · [当前限制](../../services/buildr/docs/known-limitations.md) |
| 组织工作与协作 | 怎样组织项目、方法、任务和知识，让工作持续推进？ | [工作范围与代码](architecture/project-service-repositories.md) · [技能体系](architecture/buildr-skill-system.md) · [任务协作](architecture/task-system.md) · [知识维护](architecture/knowledge-maintenance.md) |
| 系统与数据 | 系统由什么组成，代码在哪里，数据由谁保存与修改？ | [技术架构](architecture/technical.md) · [代码全景](../code-map/README.md) · [数据设计](architecture/buildr-data-design.md) · [数据库表](architecture/buildr-database-tables.md) |
| 开发与验证 | 怎样准备开发，并为实际改动选择合适的检查？ | [贡献指南](https://github.com/BuildrAI/Buildr/blob/main/CONTRIBUTING.md) · [项目测试与验证](architecture/workspace-testing-and-verification-framework.md) · [产品验证框架](architecture/verification-framework.md) |
| 扩展与接口 | 怎样查命令与数据格式，接入工具或组合工作方法？ | [命令参考](../../services/buildr/docs/cli-reference.md) · [公开数据格式](reference/json-contracts.md) · [工具适配](reference/agent-runtime-adapter-contribution.md) · [能力契约（Capability Contract）](../../services/buildr/docs/skill-capability-contracts.md) |
| 发布与维护 | 怎样发布、查看版本变化，并处理维护问题？ | [发布流程](flows/open-source-release.md) · [首版准备审查](../reviews/v0.1.0-readiness.md) · [安装与入口恢复](../../services/buildr/docs/bootstrap-guide.md) |
| 理念文章 | Buildr 如何看待智能体（Agent）与长期工作资产？ | [工作基础设施](../../docs/publications/buildr-agent-work-infrastructure.md) · [更多、更好的工作](../../docs/publications/buildr-agent-more-and-better.md) |

## 查找与接着读

在 Buildr 中，搜索位于左侧目录上方。输入关键词可筛选当前阅读方式的内容，命中项会保留所属章节或主题；补充阅读同样可以找到。打开正文后，目录和搜索仍在原处；清空关键词即可回到之前展开的目录。窄屏可展开目录选文，再继续阅读。

- **主题阅读**：想理解 Buildr 怎样工作时，从《Buildr 整体认识》进入，沿问题阅读相关说明、技术图（Technical Diagram）和代码地图（Code Map）。
- **文档目录**：想查使用指南、开发说明或专项参考时，从本手册进入，按阅读目的查找可读取的普通 Markdown 文档；主题阅读中的说明和代码地图（Code Map）正文也在这里。

两边重合的正文只维护一份。交互图从主题阅读进入；规范（Specification）、规则（Rule）和技能（Skill）保留各自入口，不计入文档目录。文件位置可以在阅读时查看，GitHub 上可沿本页和[知识导航](../README.md)的链接继续阅读。

## 开发参考

开发从工作空间（Workspace）根使用 `projects/product/buildr`，按实际修改范围进入相应服务（Service）。产品目录中的 `preparation.yml` 与 `verification.yml` 声明准备和验证入口；运行与构建命令在 `services/buildr/package.json` 和 `services/buildr-web/package.json`，开发工具在 `services/buildr/tools/development/`。正式自举由专用执行器完成，边界见项目与根 `AGENTS.md`。

专项问题按需查阅：[智能体（Agent）工具支持](../../services/buildr/docs/agent-runtime-adapters.md)、[命令架构](../../services/buildr/docs/cli-architecture.md)、[资源交付](../../services/buildr/docs/resources.md)、[Archify 组件（Component）](../../services/buildr/docs/archify-component.md)、[OpenSpec 协作](architecture/task-system.md#openspec-变更怎样推进)和[每日演进](flows/project-daily-progress.md)。

正文解释当前行为，行为约定以 OpenSpec 为准。普通文档直接维护，历史通过 Git 查找；服务内参考仍在原位置保存，不为阅读目录复制正文。本页不保存本机运行状态、凭证或部署完成结论。
