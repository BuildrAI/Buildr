# Buildr 使用与开发手册

第一次使用，顺着第一章阅读即可。后面的章节按问题查阅，每个主题只有一份正文。

在 Buildr 中，打开“Buildr 产品 → 项目知识”，从“使用手册”按目录阅读，或在“全部资料”中检索。这里收录手册、参考、代码地图（Code Map）和当前首版审查，网页与仓库读取同一份文档。

## 一、开始工作

1. [了解 Buildr](overview.md)：用途、人与智能体（Agent）的分工、当前边界。
2. [开始使用](guides/getting-started.md)：让智能体（Agent）安装并引导配置项目和代码。
3. [日常使用](guides/usage.md)：表达目标、查看成果、中断后继续与交付。
4. [排查问题](guides/troubleshooting.md) · [数据保全](guides/data-and-upgrades.md)：遇到问题或准备更新时再读。

## 二、组织资料和方法

| 主题 | 解决的问题 |
| --- | --- |
| [项目、服务与代码库](architecture/project-service-repositories.md) | 业务目标如何关联真实实现？ |
| [规则（Rule）与技能（Skill）](architecture/buildr-skill-system.md) | 方法存在哪里，怎样交给智能体（Agent）使用？ |
| [项目知识](architecture/knowledge-maintenance.md) | 怎样维护说明、图示与代码定位，避免越写越乱？ |
| [任务协作](architecture/task-system.md) | 怎样接续、协调多项工作，并验收和交付？ |
| [项目测试与验证](architecture/workspace-testing-and-verification-framework.md) | 怎样利用项目已有检查判断结果？ |
| [OpenSpec 协作](flows/openspec-change-lifecycle.md) | 采用 OpenSpec 时怎样维护行为约定与变更？ |

## 三、开发 Buildr

先读[贡献指南（GitHub）](https://github.com/BuildrAI/Buildr/blob/main/CONTRIBUTING.md)，再按需要选择：

| 主题 | 阅读 |
| --- | --- |
| 设计与实现 | [架构目录](architecture/index.md) · [产品架构](architecture/product.md) · [技术架构](architecture/technical.md) |
| 数据 | [数据设计与本机存储](architecture/buildr-data-design.md) · [数据库表参考](architecture/buildr-database-tables.md) |
| 开发与检查 | [开发环境](guides/development-and-operations.md) · [产品验证框架](architecture/verification-framework.md) · [测试上下文（Test Context）](guides/node-test-context-runtime.md) |
| 定位与看图 | [代码地图（Code Map）](../code-map/README.md) · [交互技术图](../archify/index.md) |
| 专项维护 | [发布](flows/open-source-release.md) · [每日演进](flows/project-daily-progress.md) · [文档维护](guides/documentation-maintenance.md) |
| 当前首版准备 | [0.1.0 准备审查](../reviews/v0.1.0-readiness.md)：已修复问题、验证范围及正式发布前的剩余工作 |

## 四、按需查阅

- [安装与命令参考](../../services/buildr/docs/cli-reference.md) · [工具适配](../../services/buildr/docs/agent-runtime-adapters.md) · [已知限制](../../services/buildr/docs/known-limitations.md) · [安装恢复](../../services/buildr/docs/bootstrap-guide.md)。
- [命令架构](../../services/buildr/docs/cli-architecture.md) · [公开数据格式](reference/json-contracts.md) · [资源交付](../../services/buildr/docs/resources.md) · [能力契约（Capability Contract）](../../services/buildr/docs/skill-capability-contracts.md)。
- [新增工具适配](reference/agent-runtime-adapter-contribution.md) · [Archify 组件（Component）](../../services/buildr/docs/archify-component.md)。
- [术语表](glossary.md) · [后续方向](directions.md)。

正文解释当前行为；[正式规范](../../openspec/specs/)保存行为约定，单次变更保留在 OpenSpec 中。过时的普通文档直接更新、合并或删除，历史可通过 Git 查找。

部分技术参考暂存于服务目录，本目录直接引用唯一正文；当前正式安装包只带其中的安装恢复指南。图示按用途使用：GitHub 首页可直接阅读 Mermaid；现有交互图在 Buildr Web 查看，GitHub 只显示其 HTML 文件。
