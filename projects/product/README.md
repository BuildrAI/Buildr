# Buildr 项目文档

这里是使用和开发 Buildr 的文档入口。按当前需要选择，不必从头读完。

| 你想做什么 | 从这里开始 |
| --- | --- |
| 安装、配置、日常工作或处理问题 | [使用指南](knowledge/docs/guides/getting-started.md) |
| 参与开发 | [开发指南](knowledge/docs/guides/development-and-operations.md) |
| 查命令、工具适配或其他细节 | [手册与参考目录](knowledge/docs/README.md) |
| 查看首版准备结果 | [0.1.0 准备审查](knowledge/reviews/v0.1.0-readiness.md) |

理解 Buildr 的目标、系统、任务、数据和测试，请从项目首页的“项目知识”进入；仓库内也可以阅读[知识目录](knowledge/README.md)。知识按理解问题组织，操作和参考资料从本页查阅，正文只维护一份。

## 产品工程

本项目维护产品知识、规则、规范和两个实现部分：

- [`services/buildr/`](services/buildr/)：命令行接口（CLI）、本机业务能力、网页托管与 npm 分发。
- [`services/buildr-web/`](services/buildr-web/)：React 页面、交互与正式前端构建。

贡献约定见[贡献指南](https://github.com/BuildrAI/Buildr/blob/main/CONTRIBUTING.md)。

[正式规范](openspec/specs/) · [技术架构](knowledge/docs/architecture/technical.md) · [代码地图（Code Map）](knowledge/code-map/README.md) · [技术图](knowledge/archify/index.md)

开发时从工作空间（Workspace）根使用 `projects/product/buildr`。它只委托后端服务（Service）的入口；依赖安装和检查从对应服务（Service）目录执行，不覆盖本机正式安装。
