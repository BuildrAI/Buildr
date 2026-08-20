## Why

现有“UI Preview／界面预演稿”既与用户对可交互界面原型的认知不一致，也没有要求后续 Agent 在已有产物时按其信息架构、布局和交互实施，已多次造成原型与正式页面脱节并产生二次返工。现在需要把这项能力非兼容地统一为“UI Prototype／界面原型”，同时保留轻量、自包含、可重载的默认生成方式。

## What Changes

- **BREAKING**：将 `ui-preview` Skill、`UI Preview／界面预演稿／预演`术语、`buildr:ui-preview` 标记、`/ui-previews` API 和 Task 详情“预演”入口统一替换为 `ui-prototype`、`UI Prototype／界面原型／原型`、`buildr:ui-prototype`、`/ui-prototypes` 与“原型”入口；不兼容旧 Skill、标记、API 或产物。
- Buildr 提供默认 `ui-prototype` Skill，继续调查现有真实界面，并根据 Task intent、proposal、design、delta specs 和 current knowledge 生成一个或多个使用模拟数据与本地交互的静态自包含 HTML 页面并完成浏览器验证。
- 用户可通过现有的同名 Skill 重载机制替换默认 `ui-prototype`，不新增 capability contract、producer registry 或第二套生成协议。
- 一旦当前 Task 已生成界面原型，除非用户明确要求忽略该原型，后续 Agent 必须读取并按原型开发页面信息架构、布局和交互；需要成为正式行为的选择仍必须写入 design、delta specs、Brief 和 tasks。
- Task 详情“原型”Tab 支持发现、列出、切换、操作和新窗口打开多个原型页面，继续保持 Task-scoped 只读发现、opaque-origin sandbox 与离线 CSP 边界。
- 界面原型仍不是 canonical spec、Planning Identity、Task Verification Result、正式设计稿或默认像素级验收标准，也不新增 Task Record、数据库进度状态、固定目录或独立存储。

## Capabilities

### New Capabilities

- `ui-prototype`: 定义默认界面原型 Skill 的触发、真实界面调查、单页或多页自包含 HTML、浏览器验证、可重载边界，以及已有原型默认约束后续开发的规则。

### Modified Capabilities

- `ui-preview`: 移除旧 UI Preview 的全部公开要求，明确旧 Skill、标记和产物不再受支持。
- `product-agent-skills`: 将内置 Skill 投射与 Task/OpenSpec 工作流路由从选择式 `ui-preview` 改为可重载的 `ui-prototype`，并要求已有原型默认作为后续前端开发输入。
- `local-app-web-client`: 将 Task 详情入口和 Task-scoped API 非兼容地改为“原型”与 `/ui-prototypes`，并明确支持多个原型页面的列表、切换和隔离展示。

## Impact

- Buildr workspace package 中的 Skill 资产、builtin manifest、Task Triage、Task Development 与 OpenSpec propose/update/apply contributions。
- Product canonical specs、Brief、术语表及 Buildr/Buildr Web current knowledge。
- Change Application 的原型发现 read model、本机 HTTP 路由与响应类型。
- Buildr Web Task 详情 Tab、原型页面组件、样式与中文文案。
- Skill contract、Change Application、HTTP 与 Buildr Web 集成测试；旧接口与旧标记的负向覆盖。
