## 1. OpenSpec 与契约
- [x] 更新 `magpie-model-provider` 规范以覆盖 Magpie 分组、卡片、浮窗及模型筛选。
- [x] 在 `buildr-harness` 的 `ModelOffering`、`operation-schemas.ts`、`application.ts` 与 `magpie.ts` 中解析并透传 `upstreamProvider` / `upstreamProviderLabel`，重新生成 HTTP DTO。

## 2. 前端实现
- [x] 在共享 `model-picker.ts`、对话模型选择器和执行模型选择器中按 `<上游供应商> · Magpie` 分组。
- [x] 改造 Magpie 额度详情页为上游独立卡片、移除冗余“重新读取额度”按钮并接入页面“刷新”，统一百分比最多保留两位小数。
- [x] 在供应商额度浮窗读取并按 `<上游供应商> · Magpie` 分组展示 Magpie 上游账号额度。
- [x] 修复模型系列归类，在 Magpie 模型列表新增按上游供应商筛选，并移除批量启停按钮多余的 `（当前筛选）` 后缀。

## 3. 测试与验证
- [x] 补充后端集成测试与前端单元/渲染测试覆盖新增分组、系列归一、筛选、浮窗与百分比精度。
- [x] 运行 `build:web`、`test:static`、`test` 与 `agent-integration-models-accounts` 验证全部通过，并启动工作树预览。
