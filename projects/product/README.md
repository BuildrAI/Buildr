# Buildr 产品开发入口

这里帮助贡献者找到开发依据、实现位置和适用检查。开始使用产品，请读[使用指南](knowledge/docs/guides/getting-started.md)；其他资料见[阅读目录](knowledge/docs/README.md)。

## 开始开发

在智能体（Agent）工具中打开本仓库根目录，先读取适用的 `AGENTS.md` 与[贡献指南](../../CONTRIBUTING.md)，再按改动范围准备环境。

- [开发准备](preparation.yml)声明环境和依赖入口，Node.js 版本以 [`.node-version`](.node-version) 为准。
- [测试地图](verification.yml)声明检查的适用范围；从[产品验证框架](knowledge/docs/architecture/verification-framework.md)理解如何选择检查。
- [代码地图（Code Map）](knowledge/code-map/README.md)帮助从职责定位实现；专项说明见[开发参考](knowledge/docs/README.md#开发参考)。

从工作空间（Workspace）根使用 `projects/product/buildr`。它委托安装包所在服务（Service）的入口；依赖安装和检查从对应服务（Service）目录执行。不要重新初始化本仓库，也不要用开发目录覆盖本机正式安装。

## 产品工程

本项目维护产品知识、规则（Rule）、规范（Specification）和三个服务（Service）的实现：

| 实现位置 | 职责 |
| --- | --- |
| [`services/buildr/`](services/buildr/) | 安装包、命令行接口（CLI）、本机业务能力、网页托管与 npm 分发 |
| [`services/buildr-web/`](services/buildr-web/) | React 页面、交互与正式前端构建 |
| [`services/dsh-plugin/`](services/dsh-plugin/) | DSH 桌面插件，独立维护版本、构建、验证与发布边界 |

三个服务（Service）在工作空间（Workspace）根部的 `services/manifest.yml` 登记，通过 `repositoryId` 引用同一个代码库实例（Repository Instance），以 `modulePath` 定位各自目录；本项目在 `projects/manifest.yml` 通过 `serviceIds` 引用它们。代码来源由根部 `repositories/manifest.yml` 登记，不因服务目录分开就成为独立的 Git 仓库。[技术架构](knowledge/docs/architecture/technical.md)解释组成与边界；[正式规范](openspec/specs/)保存行为约定，实际实现仍需按改动核对。

[阅读目录](knowledge/docs/README.md)帮助理解系统、任务（Task）、数据和测试之间的关系；[技术图（Technical Diagram）](knowledge/code-map/README.md#按问题找图)用于按需深入。网页与仓库链接指向同一份正文。

发布维护见[发布流程](knowledge/docs/flows/open-source-release.md)。[0.1.0 准备审查](knowledge/reviews/v0.1.0-readiness.md)保留当时的观察，不代表当前版本已经发布或全部问题已解决。
