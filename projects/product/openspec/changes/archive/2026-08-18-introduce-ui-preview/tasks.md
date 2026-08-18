## 1. UI Preview Skill 与工作流

- [x] 1.1 在 Buildr package 新增 optional `ui-preview` Skill 和 manifest 投射，保持无 capability contract
- [x] 1.2 更新 Task Triage、Task Development 与 OpenSpec propose/update/apply contributions，执行非阻塞询问并只在明确确认后路由 Skill
- [x] 1.3 增加 Skill/package 静态验证，覆盖自包含完整页面、真实 UI 调查、浏览器验证和能力边界

## 2. Task-scoped 预演发现

- [x] 2.1 在 Change Application 实现对 Task 关联 working Change 的有界 HTML 标记发现、portable metadata 与诊断
- [x] 2.2 新增只读 Task UI Preview HTTP endpoint，保持 path、session、同源 HTML 与 writer 边界
- [x] 2.3 增加 active/archived、候选优先、未标记、符号链接和安全边界测试

## 3. Buildr Web 预演视图

- [x] 3.1 在 Task 详情新增“预演”Tab、多页面选择、来源信息、刷新与明确空态
- [x] 3.2 用 opaque-origin sandbox iframe 和离线 CSP 展示可交互 HTML，不把内容注入主 DOM
- [x] 3.3 增加 React/静态契约测试、样式与窄屏适配

## 4. 当前认知与直接验证

- [x] 4.1 更新 Product glossary、Buildr/Buildr Web Service knowledge 与编码式原型 roadmap，收敛 UI Preview 边界
- [x] 4.2 运行 OpenSpec strict validation、Buildr affected tests、Buildr Web build 与 package static validation
- [x] 4.3 通过生产托管 Buildr Web 在浏览器验证 Task 预演 Tab、空态、多页面选择、核心交互与安全隔离
- [x] 4.4 执行 current knowledge reconcile，确认 Brief、specs、实现、术语和 impact evidence 一致
