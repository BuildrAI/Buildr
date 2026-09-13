# 开发与运行入口

覆盖 Buildr 自身开发、验证、启动与维护的阅读入口，不保存某台机器的运行状态、凭证或部署完成结论。事实来源是下列实际工程入口和对应说明；命令和环境变化时只更新受影响链接与说明。

| 目标 | 从哪里开始 |
|---|---|
| 理解代码组织、选择修改位置 | [服务分层](../architecture/service-architecture.md)、[代码地图](../../code-map/README.md) |
| 找到开发与构建入口 | [Buildr 工程声明](../../../services/buildr/package.json)、[前端工程声明](../../../services/buildr-web/package.json)、[开发工具](../../../services/buildr/tools/development/) |
| 选择必要检查 | [项目测试地图](../../../verification.yml)、[产品验证框架](../architecture/verification-framework.md) |
| 使用命令、配置与启动本机界面 | [命令参考](../../../services/buildr/docs/cli-reference.md)、[引导说明](../../../services/buildr/docs/bootstrap-guide.md) |
| 制作与维护技术图 | [可选 Archify 组件](../../../services/buildr/docs/archify-component.md)，按目标使用，未安装不影响无关工作 |
| 排查技能投射与宿主支持 | [技能体系](../architecture/buildr-skill-system.md)、[适配器支持](../../../services/buildr/docs/agent-runtime-adapters.md) |
| 准备发布、处理失败与恢复 | [发布与恢复流程](../flows/open-source-release.md) |
| 判断已知产品限制 | [已知限制](../../../services/buildr/docs/known-limitations.md) |

本工作空间（Workspace）开发使用项目的 `buildr` 入口。正式自举由专用执行器完成，具体边界以项目和根 `AGENTS.md` 为准。运行前根据目标选择实际入口；仅修改解释文档不需要机械运行无关代码测试。
