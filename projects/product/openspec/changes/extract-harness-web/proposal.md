## Why

目录宿主和唯一 API 解耦后，用户仍需要一套能直接使用的完整 Harness 界面，而不是让独立产品与 Development 各自重组聊天控件。本变更交付同一功能包的三种承载，并解决独立网页随执行后台换代的可用性。

## What Changes

- 依赖 [split-buildr-harness-product](../split-buildr-harness-product/proposal.md) 的宿主、启动编排和唯一 API；本变更只负责 UI、网页承载及其认证，不再次修改其条款。
- 共享完整功能：对话导航/搜索/历史、消息及工具过程、输入/附件/发送/排队、模型/权限选择、问题/审批/停止/接续、内核连接和订阅/BYOK设置，以及订阅、缓存、重连和冲突反馈。
- Development 的对话集成只保留入口布局、业务上下文和业务动作；工程业务页面继续独立维护。用窄宿主适配接任务、文件和导航。按历史只读、输入发送、执行控制、设置四片迁移，每片立即回接 Development。
- 独立 Harness Web 是薄壳，Development 提供内嵌与专注两种承载；三者功能共用，不采用 iframe 或微前端。
- **BREAKING**：前端权威从全部归 `buildr-web` 改为共享功能、独立壳与 Development 业务前端分工。允许用户显式打开独立 Harness 时启用一个回环网页入口；Development 内嵌仍只走自身同源代理，默认不启动第二网页监听。
- 两产品网页可同时存在，但只连接一个逻辑 Harness 服务。独立监听由当前协调代次唯一持有，兼容换代保留地址和有效页面会话，允许短暂重连；旧执行仍由原代次持有。
- 完整 UI 与独立壳、Development 业务页面及接入组件保持边界；三形态共享要求适用于本次 Harness 承载，不把共同 UI 强加给未来不使用 Harness 的宿主原生对话。

## Capabilities

### New Capabilities

- `harness-web-composition`: 完整对话功能、窄宿主适配、三种承载、状态连续性、独立监听与页面认证交接。

### Modified Capabilities

- `buildr-web-service`: 前端源码/构建权威与按证明对象划分的测试归属。

## Impact

- 新增 `services/buildr-harness-ui/` 和 `services/buildr-harness-web/`；从 `buildr-web/src/features/agent-conversations/` 及实际设置入口抽取共同实现。
- Harness 核心增加可选网页承载、端点发现和启动登录引导；共享 HTTP/SSE 继续消费第一变更的唯一实现。
- 更新实际服务登记、构建/测试声明、知识地图及 Agent 使用说明；不提前宣称独立安装完成。
- 不负责 npm 发布、操作系统启动器或法律许可结论；由 [distribute-harness-products](../distribute-harness-products/proposal.md) 消费本变更成果。整体由[同一任务](@task/harness-product-split-plan)跟踪。
- 不实现 DSH 插件或原生界面融合，不以 DSH 完整承载验证为前置；不新增工作摘要、工作概览、模式选择器或行业工作台，既定内嵌/专注及现有完整功能保持范围。
