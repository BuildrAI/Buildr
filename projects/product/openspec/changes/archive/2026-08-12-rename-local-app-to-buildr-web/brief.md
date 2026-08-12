# 将 Buildr Local App 迁移为 Buildr Web

## 一句话摘要

把当前浏览器中的本机界面统一为 Buildr Web，以 `buildr web` 作为唯一 canonical CLI，并安全迁移图形 Launcher、规范、文档和验证，同时保持现有 HTTP、安全、SQLite/Application authority 与正式 Web dist 不变。

## 背景与问题

当前公开表面混用 Local App、Buildr App、Buildr Web、`buildr app`、`Buildr.app` 与 `Buildr Dev.app`。这既占用了未来桌面产品的 Buildr App 名称，也使前端 Service、Runtime、Launcher 与用户产品责任不清；CLI 帮助、Doctor、Skill、bootstrap、文档和测试会继续生成旧命令。

## 目标与非目标

目标是统一公开术语和命令，区分 Buildr Web、Buildr Web Frontend Service、Buildr Web Runtime、Buildr Web Launcher 与保留术语 Buildr App，并完成 Buildr-owned 旧 Launcher 的受控迁移。非目标是重构 HTTP API、安全、SQLite、Application writer、Workspace Registry、内部 `local-app` 路径/identity，或引入桌面 WebView、远程服务和第二套数据 authority。

## 受影响角色

- Buildr 用户：通过 `buildr web` 或 Buildr Web Launcher 打开同一浏览器产品，不再面对 App/Web 混名。
- Agent：从 CLI catalog、Skill、Doctor、bootstrap 与文档获得唯一 canonical command 和清晰责任边界。
- Buildr 维护者：在 Buildr Web Frontend Service 与 Buildr Web Runtime 之间保持单一源码/托管/数据边界，并能验证 Launcher 迁移。

## 核心流程

用户运行 `buildr web` 或点击 Buildr Web Launcher；Launcher 调用同一 CLI，CLI 按需启动只监听 loopback 的 Buildr Web Runtime，Runtime 托管 `buildr-web` 正式构建写入的同一 Web dist，并通过现有 session/Origin 与 Application 调用访问 Workspace authority。正式 Task preview 继续使用 `buildr web preview` 与 Environment ownership/cleanup。

## 关键变化

- `buildr app` 命令族直接迁移为 `buildr web`，旧 domain 按标准 unknown-command 处理，不提供 alias。
- release/development 图形入口改名为 Buildr Web / Buildr Web Dev，并执行 `buildr web`。
- 安装/卸载只迁移可证明 Buildr-owned 的旧 bundle/shortcut；未知文件保留并报告。
- 页面、帮助、错误、日志说明、Skill、Doctor、bootstrap、docs/specs/current knowledge 统一公开术语。
- 已发布 schema、环境变量、SQLite/persistence identity 与内部 `local-app` 目录默认保留。

## 影响、风险与兼容性

这是公开 CLI 的破坏性迁移，旧脚本必须改用 `buildr web`。保留 bundle/protocol identity 有助于证明旧 Launcher ownership，但安装过程必须在新入口验证成功后精确清理旧入口，避免 LaunchServices 或 Windows shortcut 残留。通过分类 residual audit 防止旧公开文案遗漏，也防止误改内部兼容标识。

## 验收摘要

- 根帮助、主题帮助与 executable catalog 只展示 `buildr web`；`buildr app` 标准 unknown。
- `buildr web --no-open` 通过隔离 loopback health/readiness，普通 CLI 不启动 HTTP。
- macOS/Windows 新 Launcher 名称和内容正确，owned legacy 迁移/卸载及 foreign preservation 通过。
- checkout、npm tarball、development/release Launcher 托管同一正式 Web dist，npm 安装后不依赖 `buildr-web` 源码或 Vite。
- preview Task ownership/cleanup、browser production hosting、SQLite/Application authority 与安全模型无回归。
- specs、current knowledge、glossary、实现、测试和文档一致。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/cli-product-surface/spec.md`
- `specs/local-workspace-application/spec.md`
- `specs/npm-cli-package/spec.md`
- `specs/buildr-web-service/spec.md`
- `tasks.md`
