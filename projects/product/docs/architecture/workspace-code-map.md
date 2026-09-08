# 工作空间代码地图（Workspace Code Map）

工作空间模块的当前目录、对象和方法统一维护在[全项目模块内部目录树](../../knowledge/code-map/technical-layers.md#工作空间模块目录树)。

- [项目与两个服务的完整目录树](../../knowledge/code-map/README.md)
- [关键调用、数据与副作用](../../knowledge/code-map/calls-data-effects.md)

工作空间负责自身与项目、服务的身份和登记。每日演进现归入 `src/modules/task/daily-progress/`，以 Git 提交为主、关联本地任务，保持原 YAML 文件位置。

保留 Workspace、Project、Service 的独立对象与应用；Git、来源文件操作、管理身份保护具有独立技术责任。是否拆文件取决于稳定维护边界和阅读成本，不按操作数机械拆分。
