## Why

前端变化目前只能在正式实现或另行制作原型后看到完整页面效果，提案阶段缺少一个基于现有真实界面、成本足够低且不会阻塞普通任务的对齐手段。Buildr 需要把 UI Preview 明确为用户选择后才执行的独立能力，并让任务相关预演稿能在 Buildr Web 中直接查看。

## What Changes

- 新增独立、optional 的 `ui-preview` Skill：任务可能改变前端 UI 时先询问用户，只有明确确认后才调查现有界面并生成预演稿；未确认或用户拒绝时正常推进任务。
- 预演稿以一个或多个自包含 HTML 文件表达实施变化后的完整页面，延续现有产品的信息架构、页面框架、视觉语言和交互习惯，并在浏览器中验证核心展示与交互。
- 正式 Task 的预演稿可放在其关联 OpenSpec Change 内的任意目录，通过轻量 HTML 标记被发现；不新增数据库状态、CLI、固定目录或 capability contract。
- Buildr Web 任务详情新增“预演”视图，只读列出并展示 Task 关联 Change 中的预演页面；交互 HTML 在隔离 iframe 与离线 CSP 下运行，不能获得 Buildr Web 的同源/session 权限。
- 明确 UI Preview 不是正式设计稿、生产原型、像素级验收标准或真实前端工程中的编码式原型；不恢复已删除的 UI 视觉重构 Skill。
- 本变更不包含破坏性变化。

## Capabilities

### New Capabilities

- `ui-preview`: 定义 UI Preview 的选择式触发、真实界面调查、完整页面 HTML 产物、浏览器验证、任务关联发现及使用边界。

### Modified Capabilities

- `product-agent-skills`: Buildr package 新增 optional `ui-preview` Skill，并在 UI 相关任务与 OpenSpec 研发流程中执行非阻塞询问与确认后路由。
- `local-app-web-client`: Buildr Web 任务详情新增只读“预演”视图，通过 Task-scoped Change read model 安全加载和隔离展示预演页面。

## Impact

- Buildr package manifest、`ui-preview` Skill 源资产、Task Triage/Development 与 OpenSpec component contributions。
- Buildr Change Application 和本机 HTTP 只读 API；不修改 Task Record、Task Development、Execution Artifact 或 Task Environment 持久模型。
- Buildr Web 任务详情 React 视图、样式与受影响测试。
- Product glossary、Buildr/Buildr Web Service knowledge 与编码式原型 roadmap 边界说明。
