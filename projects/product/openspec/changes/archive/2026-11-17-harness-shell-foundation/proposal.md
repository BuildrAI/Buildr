## Why

已确认以 Harness 为主体、工作环境按需接入。当前独立网页把目录、对话和页面容器装在一起，缺少独立的工作环境挂载边界；先搭最小框架，避免同时迁移 Development 和建设通用插件平台。

本步目标与完成依据见[任务说明](@task/harness-shell-foundation)。

## What Changes

- 从完整 Harness 网页提取通用外壳，独立入口使用同一外壳。
- 接受构建时显式传入的单个可选工作环境，默认仍展示对话；环境按需打开，收起后保留已挂载状态。
- 工作环境只拥有自己的区域；其渲染失败不卸载对话或改变执行。
- 保留 Development 当前 iframe 集成和所有数据、认证、执行协议。本步无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-web-composition`：新增 Harness 外壳的可选工作环境装配与对话稳定性要求；不替换现有 Development 嵌入要求。

## Impact

- 实现限定于 `services/buildr-harness-web` 的外壳、入口、样式及相关测试。
- 不增加公开 npm 包或运行依赖，不调整服务组成，不迁移账号和历史。
- 不迁入 Development，不新增任务上下文插槽、对象分发、动态加载、插件市场、多环境切换或 DSH 适配。
- 当前产品说明只需区分“外壳基础已具备”和“Development 尚未迁入”；原双产品技术图和现有嵌入链路仍成立，不重画。
