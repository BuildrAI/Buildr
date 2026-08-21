## Why

Task Retrospective 的领域、应用、持久化与接口实现仍分散在 Service 的遗留目录中，Bootstrap、HTTP Host 和验证登记也直接依赖这些旧入口。Task 模块扁平分层约定已经成为当前架构事实，现在需要完成一个保持行为等价的窄迁移，消除第二套组织入口并为后续 Task 能力切片降低并行冲突。

## What Changes

- 将 Task Retrospective Domain、Application、业务 Repository、内部 driver 与 HTTP adapter 迁入 `src/task/` 的对应技术层。
- 通过 `src/task/module.mjs` 统一暴露 Retrospective Application、内部 workflow runner 与 HTTP handler 的组装能力，并更新 Bootstrap、HTTP Host 和调用方 imports。
- 更新 Application Payload、Verification owner 与相关测试，使旧目录入口全部退出且新模块仍由既有验证能力覆盖。
- 保持复盘报告、`pending | handled | no-action` 处置、CAS、终态限制、SQLite schema、事务及公开 CLI/HTTP/JSON 行为不变。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

- `task-retrospective-module-architecture`: 定义 Task Retrospective 纵向能力在 `task` 模块中的扁平技术分层、窄模块入口、唯一装配和旧入口退出边界。

### Modified Capabilities

- 无。现有 `task-retrospectives`、`buildr-package-assets`、`local-app-web-client` 等规范行为保持不变。

## Impact

- 影响 Buildr Service 的 `src/task/`、遗留 Retrospective 实现目录、Bootstrap/HTTP Host、Application Payload 入口、验证 registry 与 Retrospective 相关测试。
- 不修改 React/Vite 前端源码、SQLite migration、公开 API schema、capability contract 或业务 writer authority。
