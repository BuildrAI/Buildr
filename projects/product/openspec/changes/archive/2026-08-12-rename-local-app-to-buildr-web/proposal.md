## Why

当前浏览器中的本机界面同时被称为 Local App、Buildr App 和 Buildr Web，canonical CLI 仍是 `buildr app`，图形 Launcher 又占用了未来桌面应用应使用的 Buildr App 名称。这种混用使产品能力、Service、运行时与平台入口边界不清，也让帮助、Doctor、Skill、安装和验证持续生成过时命令。

## What Changes

- **BREAKING**：canonical CLI 从 `buildr app` 迁移为 `buildr web`，并同步迁移 `launcher install|status|uninstall` 与 `preview start|list|stop`；`buildr app` 不再注册、推荐或作为隐藏 alias 保留，调用时按标准 unknown-command 契约处理。
- 正式建立 Buildr Web、Buildr Web Frontend Service、Buildr Web Runtime、Buildr Web Launcher 与保留术语 Buildr App 的产品边界；Buildr App 明确留给未来真正的桌面应用。
- 将 macOS/Windows 正式图形入口统一命名为 Buildr Web，开发入口统一命名为 Buildr Web Dev，并让所有 Launcher 执行 `buildr web`。
- 为旧 `Buildr.app`、`Buildr Dev.app` 与 Windows shortcut 设计 Buildr-owned 受控迁移/卸载：不覆盖非 Buildr 管理文件，不保留两个可误启动入口，并保留 Workspace Registry、日志与 Workspace 数据。
- 统一 Web 页面、帮助、错误、日志、README、CLI reference、known limitations、Doctor repair、Skill 指引、bootstrap/安装提示、current knowledge、Service 说明与 canonical specs 中的公开术语和命令。
- 保持 loopback-only、按需启动、随机端口、session token、Origin 校验、单实例、preview ownership、Workspace Registry、SQLite/Application writer 边界以及 checkout/npm/Launcher 共用同一正式 Web dist 的既有行为。
- 保留没有产品价值的内部兼容 identity，包括已发布 JSON schema id、环境变量、SQLite schema、持久化 identity、`local-app` 内部目录和测试 fixture identity；不建立第二套 HTTP、数据库、writer、Web 专用业务状态或远程服务。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-product-surface`: 将主产品入口、主题帮助、preview maintenance surface 与 unknown-command 负向契约迁移到 `buildr web`。
- `npm-cli-package`: 迁移 npm/checkout/launcher 启动入口和三入口 Web dist parity，并更新破坏性兼容边界。
- `local-workspace-application`: 将用户产品、Runtime 与 Launcher 术语迁移为 Buildr Web，并定义 Buildr-owned 旧 Launcher 的受控迁移和卸载。
- `worktree-local-app-preview`: 将 preview 命令族迁移为 `buildr web preview`，保持 Task ownership、并发隔离与 cleanup 不变。
- `local-app-web-client`: 将客户端公开名称迁移为 Buildr Web，同时保持 API/session/Application 边界和生产托管路径。
- `local-app-browser-verification`: 让 browser smoke 以 `buildr web` 的生产托管路径和现有稳定 selector 证明交付。
- `buildr-web-service`: 将 `buildr-web` 的正式名称明确为 Buildr Web Frontend Service，并保持源码/构建职责边界。
- `buildr-package-assets`: 同步 package/runtime Skill、bootstrap、Doctor、launcher lifecycle、catalog 与 Web dist 的原子交付要求。
- `human-agent-onboarding`: 将面向人的本机浏览器入口统一表达为 Buildr Web，并移除 Buildr App 混用。
- `agent-task-workflows`: 将 Agent 工作流中的公开界面称谓统一为 Buildr Web。
- `bounded-local-app-read-execution`: 将受限读取执行器的公开产品称谓统一为 Buildr Web，保持内部 Application/worker identity。
- `buildr-development-openspec`: 将研发流程中的公开界面称谓统一为 Buildr Web。
- `change-asset-indexing`: 将 Change 浏览器投影的公开称谓统一为 Buildr Web。
- `concurrent-task-acceptance`: 将并发任务验收中的公开界面称谓统一为 Buildr Web。
- `product-verification-quality`: 将验证 owner、生产托管与 launcher 相关称谓统一为 Buildr Web。
- `public-json-contracts`: 明确术语迁移不机械重命名已发布 JSON schema id。
- `service-asset-indexing`: 将 Service 浏览器投影的公开称谓统一为 Buildr Web。
- `task-closeout-orchestration`: 将收尾投影中的公开界面称谓统一为 Buildr Web。
- `task-development`: 将研发 read model 的公开界面称谓统一为 Buildr Web。
- `task-environment-preparation-plans`: 将 Environment saved-current 投影的公开界面称谓统一为 Buildr Web。
- `task-environments`: 将 Environment、preview resource 与界面投影称谓统一为 Buildr Web。
- `task-finish-execution`: 将 retained activation 影响路径中的公开界面/Launcher 称谓统一为 Buildr Web。
- `task-finish-local-app-handoff`: 将终态交付投影的公开界面称谓统一为 Buildr Web。
- `task-overview-query`: 将 Task Overview 投影的公开界面称谓统一为 Buildr Web。
- `task-record`: 将 Task Record 人类客户端的公开称谓统一为 Buildr Web。
- `task-retrospectives`: 将任务复盘客户端的公开称谓统一为 Buildr Web。
- `task-review-results`: 将 Review 客户端的公开称谓统一为 Buildr Web。
- `task-verification`: 将 Verification 客户端的公开称谓统一为 Buildr Web。
- `workspace-structured-data-store`: 将 SQLite authority 的 Web 客户端称谓统一为 Buildr Web，保持 schema/table identity。

## Impact

- Product OpenSpec、Brief/current knowledge、glossary、Project/Service 说明、README、CLI reference、known limitations 与发布前检查文档。
- `buildr` Service 的 CLI registry/parser/help/routes、Buildr Web Runtime、macOS/Windows Launcher 构建/安装/迁移、Doctor/Skill/bootstrap/package assets、npm tarball 与测试。
- `buildr-web` Service 的页面标题、可见文案、错误与构建产物；代码目录和内部 `local-app` 路径按兼容性判断保留。
- 兼容影响仅限公开命令和图形入口名称；HTTP API、安全模型、SQLite/Application authority、Workspace 数据和远程发布流程不变。
