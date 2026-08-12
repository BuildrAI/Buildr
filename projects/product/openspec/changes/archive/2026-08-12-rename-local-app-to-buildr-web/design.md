## Context

当前产品已经是浏览器中的本机 Web 界面：CLI 启动 `src/interfaces/local-app` 下的 loopback HTTP/runtime，React/Vite 源码位于 sibling `buildr-web` Service，正式构建产物写入并随 `buildr` package/Launcher 托管。它不是桌面 WebView，也没有第二套数据库或远程后端，但公开表面仍混用 Local App、Buildr App、Buildr Web、`buildr app`、`Buildr.app` 与 `Buildr Dev.app`。

本次同时影响 CLI registry/parser/help、Runtime 启动路由、preview、macOS/Windows Launcher、npm/checkout/package assets、Doctor/Skill/bootstrap、React 可见文案、OpenSpec/current knowledge 和验证。现有 HTTP API、安全与 Application authority 已稳定，不能因命名迁移重新设计。

## Goals / Non-Goals

**Goals:**

- 让 Buildr Web 成为当前本机浏览器产品的唯一公开名称，`buildr web` 成为唯一 canonical CLI。
- 明确 Frontend Service、Runtime、Launcher 与未来 Buildr App 的责任边界。
- 让 checkout、npm tarball、release/development Launcher 继续托管同一正式 Web dist。
- 安全迁移 Buildr-owned 旧 Launcher，不覆盖未知文件，不丢失 Workspace Registry、日志或 Workspace 数据。
- 用负向验证证明 `buildr app` 已从 executable catalog、主题帮助、建议和生成内容中移除。

**Non-Goals:**

- 不改变 loopback 绑定、随机端口、按需启动、单实例、session token、Origin 校验、preview ownership 或进程清理模型。
- 不改变 HTTP API、SQLite schema、Application writer、Workspace Registry 或本机数据目录。
- 不引入桌面 WebView、后台常驻服务、远程托管、第二数据库或 Web 专用业务状态。
- 不发布 tag、npm package、GitHub Release 或安装包；不执行 Task Finish。
- 不机械重命名内部 `local-app` 目录、既有 `local-app-*` OpenSpec capability code/path 及其兼容标题/Purpose、已发布 JSON schema、环境变量、SQLite/persistence identity、测试 fixture identity 或内部 Application 方法。

## Decisions

### 1. 用公开术语表统一本次迁移，不把 glossary 当行为规范

公开名称固定为：

- **Buildr Web（本机 Web 界面）**：用户实际使用的产品能力。
- **Buildr Web Frontend Service**：`projects/product/services/buildr-web`，只拥有 React/Vite 源码与正式构建。
- **Buildr Web Runtime**：`buildr` Service 中负责 loopback HTTP、session、安全和 Application 调用的运行时。
- **Buildr Web Launcher**：启动 `buildr web` 并打开默认浏览器的平台图形入口。
- **Buildr App**：保留给未来真正的桌面应用，当前尚未实现。

行为要求继续写入对应 canonical specs；glossary 只解释概念和避免混用。相比把所有组件统称为 Buildr Web App，这一分层能防止 Service、Runtime、Launcher 与用户产品再次混为一谈。

### 2. CLI 直接切换为 `web` domain，不提供 alias 或兼容路由

CLI registry、parser match、help topic、root catalog、examples、errors 与 Runtime/preview/launcher routes 全部迁移到 `web`。`app` 不进入任何 hidden/legacy registry，unknown-command suggestion 也不得推荐它。

保留 `app` alias 会形成第二套长期产品表面，并继续占用未来桌面产品命名，因此不采用。兼容影响通过 release notes/文档明确表达，而不是通过代码内 alias 稀释 canonical surface。

### 3. 复用现有 Buildr Web Runtime 和内部兼容 identity

只将 CLI route 接到现有 Runtime Application；不复制 server、preview manager、Workspace Registry 或 Web dist。内部目录如 `src/interfaces/local-app`、既有 `local-app-*` OpenSpec capability code/path 及与其绑定的兼容标题/Purpose、公开 schema 如 `buildr.local-app-instance/v1`、环境变量如 `BUILDR_APP_DATA_DIR`、SQLite/table identity 与 `localApp*` Application 标识先保留。

这些标识已参与 package/runtime、持久化、测试或外部集成，机械重命名会增加迁移风险，却不改善用户产品模型。代码注释和设计明确区分“保留内部兼容 identity”与“保留 legacy command”；后者禁止。

### 4. Launcher 改显示名和启动命令，保留 ownership identity 并执行受控迁移

新图形入口名称：release 为 `Buildr Web`，development 为 `Buildr Web Dev`；macOS 路径分别为 `Buildr Web.app` 与 `Buildr Web Dev.app`，Windows bundle/shortcut 同名。生成内容一律调用 `buildr web`。

macOS `CFBundleIdentifier` 继续使用既有 `ai.buildr.local-app` / `ai.buildr.local-app.dev`，`buildr.launcher-identity/v1` 也继续保留。它们用于证明 Buildr ownership 和稳定更新，不作为公开产品名。改变 bundle identifier 会让系统把新旧入口视为两个无关产品，增加残留和卸载风险，因此不采用。

安装采用 `stage → validate → switch → cleanup legacy`：

1. 在新名称路径构建并验证 bundle identity、channel、source/runtime 与 Web dist。
2. 只停止 matching channel 且带 launcher identity 的运行实例。
3. 安全切换新路径；失败时恢复新路径的 previous，不触碰旧入口。
4. 新入口成功后，仅当旧 `Buildr.app` / `Buildr Dev.app` 或 Windows shortcut 能通过 launcher identity、channel、已知 Buildr install root/target 证明 ownership 时删除；未知、用户修改或 foreign 文件保留并返回诊断。
5. uninstall 同时清理当前名称及可证明 owned 的旧名称，只保留 Workspace Registry、日志和 Workspace 数据。

相比无条件删除旧路径或 shortcut，这一方案避免覆盖非 Buildr 管理文件；相比永久保留旧入口，它保证不会留下两个可误启动的正式入口。

### 5. Web dist 仍由一个正式构建链交付

`buildr-web` 继续将 React/Vite 构建输出写入 `buildr/src/interfaces/local-app/web-dist`；checkout CLI、npm tarball、release Launcher 与 development Launcher 都消费这份 dist。内部输出目录不因产品术语迁移改名。

验证必须从生产托管路径启动 `buildr web --no-open` 或等价测试 fixture，不使用 Vite HMR 作为交付证据。npm tarball 安装后不得依赖 `buildr-web` 源码或 Vite。

### 6. 公开文案迁移与内部标识保留采用分类审计

搜索结果按三类处理：

- 公开表面：命令、help、Doctor suggestion、Skill/bootstrap、README/docs、页面标题/错误/日志、Launcher 名称——全部迁移。
- 规范/knowledge：规范性 Requirement/Scenario 正文和长期解释性文档统一术语；既有 `local-app-*` capability code/path 及其兼容 H1/Purpose 作为内部 identity metadata 保留，不构成当前产品名称。
- 内部兼容标识：路径、schema、env、SQLite、方法名、fixture key——默认保留；只有公开可观察且有迁移价值时才单独修改。

这避免全局字符串替换破坏持久化/接口，也避免借“内部兼容”继续向用户输出旧术语。

### 7. 验证同时证明正向入口、负向残留和不变量

CLI catalog/help 测试证明 `web` 是 primary、`web --help` 与 `help web` 一致、preview 为 maintenance、`app` 标准 unknown。Launcher structure/lifecycle 测试覆盖 macOS/Windows 新名称、启动命令、owned legacy migration、foreign preservation 和 uninstall。System/browser/npm tarball 测试覆盖 loopback health/readiness、普通 CLI 不启动 HTTP、生产 Web dist、preview ownership/cleanup 与 package parity。

JSON schema registry 和内部目录只做 inventory 负向断言，证明没有因术语迁移被机械改名。

## Risks / Trade-offs

- [破坏性 CLI 迁移会中断旧脚本] → 不保留 alias；通过帮助、README、known limitations 和 release 兼容说明明确迁移到 `buildr web`。
- [同一 bundle identifier 配合新路径可能被 LaunchServices 短暂缓存] → 安装完成后删除可证明 owned 的旧 bundle，并在 lifecycle 测试中验证只剩一个入口。
- [旧 Windows shortcut ownership 难以判断] → 只有目标/参数指向带 matching launcher identity 的 Buildr-owned bundle 时删除；无法证明时保留并报告，不盲删。
- [广泛术语替换误伤 schema、env 或内部路径] → 使用分类审计和 residual tests，明确保留清单，不执行无判断全局替换。
- [current knowledge 或 package runtime 投影遗漏旧命令] → 将 Skill/bootstrap/Doctor/package inventory 纳入 affected verification，并在 stable Content Target 前执行 knowledge/terminology inspect。
- [全量浏览器验证成本较高] → 先运行 affected selector；正式 Task Verification 仍按 declaration 和冻结 Content Target 选择所需能力。

## Migration Plan

1. 先迁移 canonical specs、CLI registry/routes/help 和相应契约测试，使 `web` 成为唯一可执行域。
2. 迁移 Runtime 可见文案、React 页面、docs/knowledge/Skill/bootstrap，同时保持内部 identity。
3. 实现并验证新 Launcher 名称、启动命令和 Buildr-owned legacy cleanup。
4. 构建正式 Web dist，运行 checkout/system/browser/npm tarball/Launcher affected 验证。
5. 收敛 current knowledge 和 Change，归档后形成稳定 Content Target，进入 Formal Verification、Completion Review 与 Development Handoff。

若实现阶段失败，只回退当前 Task worktree 内容；不修改 retained installation。未来实际发布时，新安装过程负责受控迁移，失败保留旧 owned Launcher 供后续恢复。

## Open Questions

无。公开命名、CLI 兼容策略、Launcher 名称、内部 identity 保留和安全/authority 边界均已由本 Task 明确。
