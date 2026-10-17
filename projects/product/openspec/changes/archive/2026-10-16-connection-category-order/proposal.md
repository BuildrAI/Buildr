## Why

连接主列表目前沿用实例读取顺序，同类连接可能分散，用户难以连贯查看。可选网站地址留空时也没有入口，即使基础地址已足以访问该系统；这两项已在真实连接使用中出现，需要修正。

## What Changes

- 连接主列表按类别机器键稳定排列，同类别保持原有相对顺序，搜索、刷新和局部保存后统一生效。
- 接入声明可通过 `presentation.websiteFallbackField` 显式指定基础网址字段；网站覆盖值缺失或空白时使用它，非空非法覆盖值不回落。
- 保留现有 HTTP/HTTPS 与无内嵌认证信息的地址限制。Nacos、Kibana 内置声明显式选用 `apiBaseUrl`；私有声明由其所属工作空间（Workspace）维护。
- 同步两端声明类型、解析校验与作者说明。不改变连接身份、认证目标、程序执行或专业授权。
- 无破坏性变更；旧声明不新增隐式字段猜测，也不改写已保存配置或认证。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `connection-management-ui`：主列表同类聚集，以及网站覆盖留空时的默认入口。
- `connection-skill-runtime`：受限声明新增可选网站回落字段及其引用校验。

## Impact

影响 `services/buildr` 的连接声明及公开实例投影、Nacos/Kibana 随包声明和连接作者指南，以及 `services/buildr-web` 的声明类型与列表派生排序。沿用既有目录请求及局部更新，不新增外部请求；相应声明、投影和浏览器检查覆盖行为。知识影响仅涉及作者契约说明；既有职责地图和外部系统分工未变化，实施时核对后保留。

任务目标与授权范围见[任务说明](@task/connection-category-order)。
