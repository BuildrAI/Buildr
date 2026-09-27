# Buildr 产品工程

这里维护 Buildr 的产品知识、规则、规范和两个实现部分：

- [`services/buildr/`](services/buildr/)：命令行接口（CLI）、本机业务能力、网页托管与 npm 分发。
- [`services/buildr-web/`](services/buildr-web/)：React 页面、交互与正式前端构建。

使用产品请从[手册](knowledge/docs/README.md)开始；参与开发请读[贡献指南](../../CONTRIBUTING.md)和[开发入口](knowledge/docs/guides/development-and-operations.md)。

[正式规范](openspec/specs/) · [技术架构](knowledge/docs/architecture/technical.md) · [代码地图（Code Map）](knowledge/code-map/README.md) · [技术图](knowledge/archify/index.md)

开发时从工作空间（Workspace）根使用 `projects/product/buildr`。它只委托后端服务（Service）的入口；依赖安装和检查从对应服务（Service）目录执行，不覆盖本机正式安装。
