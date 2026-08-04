## Why

「创建变更」曾允许自由输入所属项目，容易写错项目代码，也与「接入服务」等已登记选择行为不一致。现有实现改为下拉选择后，用户可见产品约束尚未进入 OpenSpec 当前事实，且异步加载项目列表存在抽屉切换竞态，可能污染后续表单。

## What Changes

- 将「创建变更」所属项目从自由文本改为只能从当前 Workspace 已登记 Project 中选择
- 上下文 Project 有效时默认选中该项目
- 没有已登记 Project 时展示空态文案，并禁止生成创建变更 prompt
- 异步加载项目列表时忽略过期响应，避免关闭/切换抽屉后污染其他表单或重复绑定提交处理器
- 补充浏览器集成对竞态与无项目空态的覆盖

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `local-workspace-application`: 收紧「创建 Change」表单的所属项目收集约束，明确选择、默认值、空态禁止生成与异步过期响应安全

## Impact

- 本机应用前端：`src/interfaces/local-app/web/features/agent-actions.js`
- 浏览器集成：`test/browser-smoke/local-app-browser.test.mjs`
- OpenSpec：`openspec/specs/local-workspace-application/spec.md` 的「创建 Change」相关场景
- 不改变 Change prompt HTTP API 契约；未知 Project 仍由既有 Application 拒绝
