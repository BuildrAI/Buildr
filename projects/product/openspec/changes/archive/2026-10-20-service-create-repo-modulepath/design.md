# 设计：新增服务按已选代码库填写模块路径

## Context

后端 `addService` 已支持三种服务登记方式：`directoryMode`（existing/create，工作空间目录并自动识别代码库）、`repositoryId` + 可选 `modulePath`、内联 `repository` 草稿。HTTP 契约 `serviceDraft` 字段齐备。缺口只在 `ServiceCreateDrawer.tsx`：`directoryMode` 恒为 `create`，目录区与「代码库（可选）」相互独立，允许矛盾组合，且没有 `modulePath` 输入。规范要求「不要求用户填写模块目录」把模式写死成目录唯一入口，本变更放宽为"目录模式下不要求填写"。

## Goals / Non-Goals

**Goals:**

- 代码库选择成为代码位置的单一决定输入，表单按选择结果切换区域，矛盾组合在结构上不可能。
- 不新增请求字段、不改变后端校验与版本保护；已保存数据不变。
- 目录模式下的引导、候选目录、自动识别与错误文案保持不变。

**Non-Goals:**

- 不调整服务编辑抽屉（`ServiceEditDrawer`）的字段范围。
- 不为 `modulePath` 提供库内目录浏览/候选（后端无对应查询能力；文本输入即可，非法路径由后端拒绝）。
- 不改动代码库候选、目录候选扫描范围。

## Decisions

1. **以 `repositoryId` 是否已选驱动区域切换，而非增加模式单选。** 区域内单字段决策最少：选了已有代码库 → 渲染模块路径输入（`Form.Item` 非必填，help 说明空值语义与库内相对路径约束），同时隐藏「服务目录」与「所在项目」；留空 → 维持现状。备选方案"新增方式单选（仅登记/服务目录）"多一层选择且与代码库字段重复表达来源，不采用。
2. **提交时按选择裁剪 draft。** 已有代码库已选：提交 `repositoryId` + `modulePath`（trim 后可为空字符串），不带 `directoryMode`、`directoryPath`、`directoryObservation`；内联新增代码库：不带 `modulePath`（后端默认为空）；代码库留空：维持现有 `directoryMode` 提交。草稿保留字段不在前端手删后端字段，依赖 `closed` 契约与 `addService` 现有互斥校验兜底。
3. **`modulePath` 前端只做轻量输入约定。** 仅 trim、提示"留空表示整个代码库"，绝对路径与 `..` 依赖后端 `relativeAssetPath`/`addService` 拒绝并回显错误；不预扫目录内容。备选"前端预校验越界"与后端规则重复且易漂移，不采用。
4. **错误提示直接透传。** `service_directory_outside_repository` 等后端错误经现有 `setError` 展示；表单结构调整后该组合不再可达，但提示本身保留给并发/手工构造请求。

## Risks / Trade-offs

- [切换代码库选择后旧草稿字段残留] → 提交端按选择裁剪字段（Decision 2），不依赖隐藏组件自然清空。
- [内联新增代码库与 modulePath 组合歧义] → 内联草稿时隐藏模块路径输入，新库恒为空 `modulePath`，与后端默认一致。
- [目录模式提示文案"不要求填写模块目录"与新行为冲突] → 规范修订只放宽限定语，目录模式语义不变。

## Migration Plan

无数据迁移与兼容期：请求/响应契约不变，旧客户端仍可用目录模式提交；新表单只在既有合法组合中选择其一。

## Open Questions

（无）
