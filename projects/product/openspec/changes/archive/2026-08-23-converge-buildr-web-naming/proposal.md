## Why

Buildr 的当前源资产仍混用 `Buildr Web`、`local-app`、`Buildr Web` 与 `Buildr Web`，使产品定位、Service 边界、CLI/Browser 验证和文档入口不一致。现在统一命名，可以在继续演进 Buildr Web 的同时消除用户可见旧称，并把必须保留的协议、环境和持久化兼容标识明确隔离出来。

## What Changes

- 将当前源代码、测试、验证 registry、Browser smoke、Skill runner、规则、文档、current knowledge 与 canonical OpenSpec 的用户可见和代码内部命名统一到 Buildr Web 分层术语。
- 将 `Buildr Web`、`Buildr Web Runtime`、`Buildr Web Frontend Service`、`Buildr Web Launcher` 作为对应公开概念；同步更新 CLI help、错误提示、测试标题和路径引用。
- 保留 `buildr.local-app-*` JSON schema/protocol、`BUILDR_LOCAL_APP_PREVIEW`、`local-app-preview` provider、SQLite/persistent identity 等已发布或跨进程兼容标识；代码以兼容别名读取，文档标注其为稳定内部身份。
- 将 publication platform 的 canonical 新写入值收敛为 `buildr-web`，读取兼容旧值 `local-app`，并补齐迁移测试。
- 将开发 Bundle Identifier 迁移到 Buildr Web 命名，同时保留对旧 Bundle Identifier 的受控识别与清理兼容。
- 明确排除 `openspec/changes/archive/**` 及其历史记录；不改历史归档文本、标题和路径。
- **BREAKING**：当前源资产中面向用户的 `local-app` publication platform 新写入值和公开命名不再作为 canonical 名称；兼容读取保留。

## Capabilities

### New Capabilities

无。本 Change 统一既有能力的公开命名和兼容边界，不新增产品能力。

### Modified Capabilities

- `buildr-web-client`：将 Buildr Web 前端的公开术语与源码/测试命名统一，并明确兼容身份不随显示名机械迁移。
- `buildr-web-browser-verification`：Browser smoke、验证入口和结果标题统一为 Buildr Web，保留串行 Browser 资源约束。
- `bounded-buildr-web-read-execution`：公开能力名称改为 Buildr Web Runtime 语义，保持只读边界和 authority 不变。
- `worktree-buildr-web-preview`：预览显示名改为 Buildr Web Preview，保留 provider 与环境变量兼容身份。
- `buildr-web-workspace-application`：统一 Runtime、Frontend、Launcher 的产品术语并禁止新的旧称泄漏。
- `public-json-contracts`：声明稳定的 `buildr.local-app-*` wire identities、兼容 publication platform reader 和 canonical writer。
- `buildr-web-instance-lifecycle`：统一实例/健康检查的公开说明，保留实例 schema 兼容身份。
- `task-finish-buildr-web-handoff`：统一交付和 handoff 的产品命名，不改变交付 authority。

## Impact

影响 `projects/product/services/buildr` 的 CLI、runtime、preview/instance lifecycle、Task Environment provider、publication 适配、launcher 与测试，`projects/product/services/buildr-web` 的页面标签与测试，以及 Product 规则、Skill、验证声明、current knowledge 和 canonical OpenSpec。数据库记录、运行中的旧协议、归档记录和功能/安全/authority/Browser/Delivery 行为保持兼容。
