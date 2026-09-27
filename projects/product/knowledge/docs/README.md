# Buildr 使用与开发手册

在 Buildr 项目首页打开“项目文档”，即可从项目说明进入本目录并连续阅读。理解系统请用“项目知识”；操作指南和专业参考在这里按需查阅，正文只维护一份。

## 使用 Buildr

先读[使用指南](guides/getting-started.md)：由智能体（Agent）安装和解释，配置后在智能体（Agent）工具中开始工作。日常接续、交付、更新保全和排障都在同一篇，不需要在多份入门文档之间往返。

## 开发 Buildr

| 需要 | 阅读 |
| --- | --- |
| 准备环境、运行和检查 | [开发指南](guides/development-and-operations.md) · [贡献指南（GitHub）](https://github.com/BuildrAI/Buildr/blob/main/CONTRIBUTING.md) |
| 理解实现与设计取舍 | [知识目录](../README.md) · [产品架构](architecture/product.md) · [技术架构](architecture/technical.md) |
| 维护变更或发布 | [OpenSpec 协作](flows/openspec-change-lifecycle.md) · [发布流程](flows/open-source-release.md) |
| 查看专项结果 | [首版准备审查](../reviews/v0.1.0-readiness.md) · [每日演进](flows/project-daily-progress.md) |

## 按需查阅

| 问题 | 唯一参考 |
| --- | --- |
| 安装、命令与当前限制 | [命令参考](../../services/buildr/docs/cli-reference.md) · [已知限制](../../services/buildr/docs/known-limitations.md) · [安装恢复](../../services/buildr/docs/bootstrap-guide.md) |
| 接入智能体（Agent）工具 | [适配说明](../../services/buildr/docs/agent-runtime-adapters.md) · [新增适配](reference/agent-runtime-adapter-contribution.md) |
| 查接口与交付资源 | [命令架构](../../services/buildr/docs/cli-architecture.md) · [公开数据格式](reference/json-contracts.md) · [资源交付](../../services/buildr/docs/resources.md) |
| 查方法组合与绘图组件（Component） | [能力契约（Capability Contract）](../../services/buildr/docs/skill-capability-contracts.md) · [Archify 组件（Component）](../../services/buildr/docs/archify-component.md) |
| 查术语、知识维护与方向 | [术语表](glossary.md) · [知识维护](architecture/knowledge-maintenance.md) · [后续方向](directions.md) |

正文解释当前行为，行为约定仍以 OpenSpec 为准。普通文档直接更新、合并或删除，历史通过 Git 查找；技术参考在原有服务目录维护，不为目录外观复制正文。技术图（Technical Diagram）和代码地图（Code Map）在项目知识中按主题阅读。
