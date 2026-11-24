## Why
Magpie 代理了多个上游模型供应商和账号，但当前界面的额度卡片分隔不清晰、存在与顶部“刷新”重复的“重新读取额度”按钮、剩余百分比未限制小数位数；模型选择器、模型管理列表和全局额度浮窗未按 Magpie 的上游供应商分组或筛选，且模型系列归类把单体名称误拆成独立系列。

## What Changes
- 后端 `ModelOffering` / `CatalogModel` 增加可选的 `upstreamProvider` 与 `upstreamProviderLabel` 字段，在 Magpie 读取 `/v1/models` 时从 `owned_by`、`magpie_label` 或模型 ID 前缀解析并透传。
- Magpie 供应商详情页将不同上游供应商拆分为独立卡片展示，移除单独的“重新读取额度”按钮并由页面“刷新”同步触发额度重读，百分比最多保留两位小数。
- 对话模型选择器、执行模型选择器及全局“供应商额度”浮窗按 `<上游供应商> · Magpie`（上游未知或为 `magpie` 时保持 `Magpie`）分组展示，继续保留模型原有 ` · Magpie` 标签、独立账号边界与未知状态。
- 修复模型系列归类逻辑，将无版本后缀的单体模型名归入 `其他` 并合并带主版本号的前缀系列；在 Magpie 模型列表工具栏支持按 Magpie 上游供应商过滤，并精简批量启停按钮文案为 `全部开启` / `全部关闭`。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `magpie-model-provider`：规范 Magpie 上游供应商分组展示、独立卡片与刷新联动、百分比小数格式、全局额度浮窗展示及模型页按上游供应商筛选和系列归类。

## Impact
`buildr-harness` 模型契约与 Magpie 提供者、`buildr-harness-web` 与 `buildr-web` 的模型选择器、Magpie 额度卡片、供应商额度浮窗及模型管理页面。
