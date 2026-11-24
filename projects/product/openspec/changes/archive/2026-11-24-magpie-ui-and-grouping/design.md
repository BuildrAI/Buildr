## Context
Magpie 网关同时聚合 `codex`、`grok`、`qoder` 等上游供应商的多个模型与账号，模型 ID 通常带有 `<upstream>/<model>` 前缀，`/v1/models` 返回 `owned_by` 与 `magpie_label`，`/v1/magpie/quotas?kept=1` 返回各上游账号的 `provider` 与 `providerLabel`。

## Decisions
- **通用上游元数据字段**：在 `ModelOffering` 与 `CatalogModel` 中增加可选通用字段 `upstreamProvider` 和 `upstreamProviderLabel`，由 Magpie 适配器从响应解析并透传，不在编排层或前端硬编码厂商名称表；当旧缓存目录尚无这些字段时，前端工具函数以模型 ID 的 `/` 前缀做兜底解析，避免升级后首次打开显示未分组。
- **选择器与浮窗分组规则**：对 Magpie 模型及 Magpie 上游额度按 `<上游供应商> · Magpie` 分组（当上游本身为 `magpie` 或缺失时保持 `Magpie`，避免 `Magpie · Magpie`），保留原有选项标识与 `模型名 · Magpie` 标签及多账号分列不合计规则。
- **详情页卡片与刷新联动**：将每个上游供应商渲染为独立卡片，百分比统一格式化为最多两位小数；移除重复的“重新读取额度”按钮，改为在刷新账号成功时递增刷新计数触发 Magpie 额度重读。
- **系列推断修正**：首词后面没有其他词段且不含字母后紧跟版本号（如 `Ultimate`、`Fast`、`Efficient`、`Sonus`、`Cantus`）的模型名统一归入 `其他`；对首词末尾带版本号的词元（如 `Qwen4`、`Qwen3.8`）剥离尾随版本号归一为同一系列（`Qwen`）。

## Risks / Trade-offs
- **全局浮窗轮询并发请求**：浮窗打开期间会对已启用的 Magpie 账号请求 `/gateway-quota`，失败或不可用时不阻断其他供应商显示或模型使用，有上次快照时保留显示并标注异常。
- **兼容既有测试严格断言**：新增 `ExecutionModelSource` / `ExecutionModelOption` 可选属性仅在存在值时写入对象，确保不破坏既有严格结构对比测试。
