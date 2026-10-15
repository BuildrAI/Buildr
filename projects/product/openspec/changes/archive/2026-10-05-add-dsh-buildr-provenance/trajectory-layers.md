# 原轨迹的分层与改造选择

状态：只读源码研究；不是已实施结果。回应用户关于原轨迹模块与会话日志（Session Log）是否需要重写的问题。

## 结论

可以基于原源码增强或重做轨迹页面，不需要重写会话日志（Session Log）。当前轨迹包并不是日志存储，它是浏览器侧消费者（Consumer），内部包含轨迹专用读模型和显示层。第一步优先保留原读模型、原详情、虚拟化、时间线与执行行为，只增加来源、对象查看与独立 Buildr 标签。此前两扩点只是“不改官方显示包、以独立插件（Plugin）贡献”的候选路线，不是唯一方案。

## 源码层次

| 层 | 实际位置 | 本次处理 |
|---|---|---|
| 原始事件与模型历史 | [core/session](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/core/session/src/index.ts#L1-L86>) | 保留；不改变序号、重放、会话（Session）或模型消息 |
| 文件持久化（Persistence） | [session-persistence-jsonl](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/session/session-persistence-jsonl/src/index.ts#L1-L6>) | 保留；不改原格式、不可变世代或迁移 |
| 主机到客户端的会话接口（Session Controller） | [api/session-controller](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/api/session-controller/src/history.ts#L71-L120>) | 复用原分页与事件源，不另建日志传输 |
| 中立会话组装（Conversation Assembly） | [ui-conversation](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-conversation/src/client/conversation/assembly.ts#L237-L249>) | 复用同一个事件源与各目标投射，不混同 Chat 与轨迹 |
| 轨迹读模型（Projection） | [trajectory-snapshot-builder](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-trajectory/src/client/trajectory-snapshot-builder.ts#L303-L320>) | 保留；必要时补传原始事件地址与已经存在的来源字段 |
| 当前轨迹页面（Presentation） | [TrajectoryTable](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-trajectory/src/client/TrajectoryTable.tsx#L2063-L2099>) | 本次主要修改位置：真实表格、原详情和页面接线 |

## 当前页面的关键位置

- [TrajectoryView](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-trajectory/src/client/TrajectoryView.tsx#L132-L161>) 读取 `useTrajectory`，装配工具栏、时间概览、布局与表格。
- [TrajectoryTable](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-trajectory/src/client/TrajectoryTable.tsx#L2063-L2099>) 内部拥有真实记录表和本地检查器（Inspector），是来源列与对象详情的主要改动点；原参数、结果、计时和概述函数可继续使用。
- [TrajectoryCell](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-trajectory/src/client/TrajectoryCell.tsx#L1-L16>) 明写旧独立组件（Legacy Component）；当前主页面不使用它，单改此文件不会改变真实表格。
- [入口](</Users/chenjun/workspaces/BuildrAI/Buildr/.worktrees/dsh-buildr-provenance/projects/product/services/dsh-plugin/build/upstream-research/dsh-v0.2.0-rc.2/packages/client/ui-trajectory/src/client/index.ts#L69-L112>) 同时登记轨迹事件定义、快照（Snapshot）构建、`useTrajectory` 和页签，不是只有一个页面登记。

## 路线比较

1. **增强原轨迹源码——推荐。** 在 `ui-trajectory` 内保留原数据投射和显示函数，修改表格、配套样式、本地化词典、页面与入口接线。Buildr 对象仍由 Buildr 插件（Plugin）主机端（Host）提供只读数据；可采用扩展位（Slot）或正式数据／回调接线，但不需要先公开原内部组件（Component）。
2. **维护定制轨迹包（Fork），正式替换原客户端入口——可行但成本更高。** 核心日志、持久化（Persistence）、会话接口（Session Controller）和中立组装均保留。现有原入口同时拥有读模型与页面：直接禁用会失去 `useTrajectory`，并行保留原入口再登记同目标会冲突。整包替换需保留其数据定义，确保组合只有一个轨迹贡献者；仅替换显示则需先拆清两项注册，不可跨功能运行时导入私有表格。包身份、构建、版本与实际组合均需验证。
3. **重写会话日志（Session Log）——本需求不需要。** 会牵涉模型重建、重放、分叉、原始序号、存储世代和格式兼容，不解决来源列与详情的显示问题。仅展示字段不进入原日志；是否需要新增模型可见事实，应作为不同需求判断。

源码可以支持较大显示调整，但本步三项不需要大规模重写。原工具与子工具布局目前丢失部分原始结果地址，补传可限定在同包记录类型与布局函数，不能用界面索引或小数排序锚冒充持久地址。内容来源、原执行载体与治理关系分别表达；不因重做页面就能够推断 Buildr 对象身份或历史正文。

## 基线与权限边界

本次研究来自官方 Git 标签（Tag）`dsh-v0.2.0-rc.2`，实际检出提交为 `639ed015397290b3745d163aafe02ffee4aa3f84`。当前安装归档的桌面构建提交为 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851`；同版本号不代表相同构建。本研究不声称二者逐文件一致。源码检出位于本任务受忽略的研究缓存，不是正式源码交付或部署位置。

本次只获取和阅读源码，没有修改它、替换任何插件（Plugin）入口、安装、启动或更新真实桌面。当前规划的“两扩点路线”待按本研究收敛，未被用户确认为唯一路线；已有规范检查只覆盖未修订材料，不提前证明下一稿。

## 接续建议

先明确采用“增强原轨迹源码”还是“维护定制显示包”，再按该路线修订设计、软件开发工具包（SDK）基线与装配计划。在原有能力可复用的前提下，不重写会话日志（Session Log），也不增加本轮延期的数据回传、计数或跨应用导航。
