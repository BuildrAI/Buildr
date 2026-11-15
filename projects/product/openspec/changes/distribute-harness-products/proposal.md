## Why

独立核心与网页可用不等于用户已经得到两个产品。必须补齐安装身份、可点击启动器、保留运行负载及共享资料的维护边界，使两产品能分别安装、独立启动和安全共存。

## What Changes

- 消费 [核心与 API](../split-buildr-harness-product/proposal.md) 和 [完整 UI 与网页](../archive/2026-11-16-extract-harness-web/proposal.md)，不再次修改其能力条款。
- 交付 Buildr Harness 与 Buildr Development 两个可独立点击的启动器；Development 未运行时 Harness 也能启动，反之无需用户先开 Harness。
- 分离产品 ID、发布/开发渠道、共享数据域和网页入口身份，改造 `webProfileName`、启动器绑定、实例发现及替换规则；不能只新增一个 runtime role 或改显示名。
- 保留 `@buildr-ai/buildr` / `buildr` 与旧数据路径；新增 Harness 独立包及 CLI。Development 仍内置兼容负载；两安装入口复用同域服务。
- 两个独立产品不要求先安装 DSH 桌面或装载 DSH 插件。Development 默认组合 Harness 是当前发行方式，不将工程业务改成不可替换的 Harness 内部模块；未来插件组合不进入当前安装清单。
- **BREAKING**：由只随现有宿主交付扩展为可选独立产品发行；这不是 `agent-process-isolation` 已经承诺的行为。保留其执行独立、旧工作连续和兼容更新语义。
- 将独立网页、运行依赖和必要程序纳入保留负载；升级、卸载、重装保全共享账号、历史和活动执行。
- 从第一变更阶段并行建立依赖/订阅条款证据，产品/发行负责人决定可分发与可宣传范围；本变更实现许可和平台证据门禁，不把 Agent 技术判断当法律批准。

## Capabilities

### New Capabilities

- `harness-independent-distribution`: 独立包、双启动器、产品与配置域身份、共存升级卸载、许可与支持声明。

### Modified Capabilities

无。此前运行、API 与前端条款分别由前两项变更唯一维护。

## Impact

- `buildr` 安装模块、`web-profile.ts`、启动器构建与绑定、Web 实例复用/替换、自举验证及 Harness 独立 CLI/包。
- 生产资源、Node/原生程序/CLIProxy 等依赖的保留路径与真实 tarball 消费测试；独立与组合安装不读取相邻源码。
- 知识、安装帮助、支持矩阵与许可文件。macOS、Windows 分别取得真实点击证据；缺少某平台证据只限制该平台声明，不冒称全平台完成。
- 本变更负责技术安装交付及发行检查，不执行公开发布，不代替人批准订阅跨工具使用。整体任务的最终验收仍包括两个启动器及 Development 两模式，见[任务说明](@task/harness-product-split-plan)。
- 不制作 Harness/Development 的 DSH 插件，也不增加依赖/不依赖 Harness 的两套插件发行物。未来 DSH 框架＋Harness＋Development 的完整组合，与 DSH 原生执行＋Development 的组合分别表达；二者复用同一工程业务，不复制产品源码。完整组合还可把 Development 替换为其他专业环境，仍使用 Harness。当前 DSH 原生执行器所需依赖仍按实际选择准备，不等同于要求安装 DSH 插件宿主。
