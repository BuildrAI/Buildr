## 1. 默认 Skill 与工作流

- [x] 1.1 将 package builtin `ui-preview` 非兼容替换为可同名重载、无 capability contract 的 `ui-prototype`
- [x] 1.2 更新默认 Skill，使其调查真实界面、支持生成一个或多个带新标记的自包含 HTML、模拟数据与交互并逐页浏览器验证
- [x] 1.3 更新 Task Triage、Task Development 和 OpenSpec propose/update/apply contributions：询问原型，并在已有原型且用户未明确忽略时默认据此开发

## 2. 原型发现与接口

- [x] 2.1 将 Change Application read model 和发现规则替换为 UI Prototype，只识别 `buildr:ui-prototype` 并返回多个页面
- [x] 2.2 将本机 HTTP API 非兼容替换为 `/ui-prototypes` 列表与内容 route，保持 Task-scoped、不透明 ID、离线 CSP 与 opaque-origin sandbox 边界
- [x] 2.3 增补新标记、多页面和旧 marker/route 不兼容的 contract/integration 测试

## 3. Buildr Web 原型视图

- [x] 3.1 将 Task 详情一级入口、组件、类型、样式和文案统一改为中文“原型”与 UI Prototype
- [x] 3.2 支持列出、选择、切换、操作和新窗口打开多个原型页面，并保留明确空态和诊断
- [x] 3.3 更新 Web 集成测试，覆盖“原型”入口、多页面列表、切换与隔离内容 URL

## 4. 当前认知与收敛检查

- [x] 4.1 更新 glossary、Buildr/Buildr Web Service knowledge 与 prototype-development 说明，移除 current authority 中 UI Preview／预演术语
- [x] 4.2 更新 Brief 与 knowledge impact evidence，确认术语、兼容性和 authority 边界无 unresolved
- [x] 4.3 运行受影响 Buildr、Buildr Web 测试、构建、旧术语负向检查与 OpenSpec strict/convergence readiness 检查
