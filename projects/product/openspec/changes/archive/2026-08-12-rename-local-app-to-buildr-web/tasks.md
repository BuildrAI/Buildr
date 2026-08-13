## 1. CLI 与 Buildr Web Runtime

- [x] 1.1 将 CLI registry、parser match、root/help topic 与 executable routes 从 `app` domain 迁移到唯一 `web` domain。
- [x] 1.2 迁移 `web launcher install|status|uninstall` 与 `web preview start|list|stop` 的 usage、摘要、错误、examples 和 Runtime 调用链。
- [x] 1.3 增加负向 catalog/help/suggestion 验证，证明 `buildr app`、`buildr help app` 和 `app` 子命令按标准 unknown-command 处理且没有 alias。
- [x] 1.4 保持 Buildr Web Runtime 的 loopback、按需启动、session/Origin、单实例、Workspace Registry 与 Application authority 不变，并验证普通 CLI 不启动 HTTP。

## 2. Buildr Web Launcher 受控迁移

- [x] 2.1 将 macOS/Windows release 图形入口改名为 Buildr Web、development 入口改名为 Buildr Web Dev，并让生成内容执行 `buildr web`。
- [x] 2.2 保留用于 ownership/兼容读取的 launcher protocol、bundle identifier 与内部 identity，同时更新可见错误、日志说明、shortcut 描述和安装提示。
- [x] 2.3 实现新名称安全切换后的 Buildr-owned `Buildr.app` / `Buildr Dev.app` / Windows shortcut 迁移；ownership 不可证明时保留并报告。
- [x] 2.4 更新 uninstall/status 生命周期，使其精确处理 owned 新旧入口并保留 Workspace Registry、日志、npm CLI、其他 channel 与 Workspace 数据。

## 3. Web 前端、package 与生成内容

- [x] 3.1 将 React 页面标题、可见文案、错误和用户说明统一为 Buildr Web，并保持稳定 DOM selector、API/session 与 Application 数据流。
- [x] 3.2 更新 Buildr Skill、bootstrap、Doctor repair、workspace package targets、安装脚本与生成命令，使其只推荐 `buildr web`。
- [x] 3.3 更新 package/README 与 npm tarball inventory，证明已安装 package 不依赖 `buildr-web` 源码、Vite 或第二份 Web dist。
- [x] 3.4 保留 `src/interfaces/local-app`、既有 JSON schema、环境变量、SQLite/persistence identity 与内部目录，并增加 residual/inventory 断言防止机械重命名。

## 4. 产品规范、current knowledge 与文档

- [x] 4.1 更新 Product/Service 规则入口与 Service registry，正式使用 Buildr Web Frontend Service、Buildr Web Runtime 和 Buildr Web Launcher 名称。
- [x] 4.2 更新产品 overview、technical architecture、CLI reference、README、manual、known limitations 与 verification ownership 中的公开术语和命令。
- [x] 4.3 在 glossary 建立 Buildr Web、Buildr Web Frontend Service、Buildr Web Runtime、Buildr Web Launcher 与保留术语 Buildr App，并保持行为事实归属 canonical specs。
- [x] 4.4 创建/收敛 Brief 与 knowledge impact evidence，核对所有受影响 canonical specs、knowledge、Skill/package projections 和术语无 unresolved。

## 5. 实现反馈与 Change 收敛准备

- [x] 5.1 更新 CLI catalog/help/public JSON、Launcher lifecycle、preview ownership、browser selector、package inventory 和 generated-assets 的 unit/contract/integration/system 测试。
- [x] 5.2 验证 `buildr web --no-open` 的隔离 loopback health/readiness，以及普通 CLI、unknown `buildr app` 和 preview 并发/cleanup 负向边界。
- [x] 5.3 构建正式 Web dist，运行生产托管 browser smoke；验证 checkout、npm tarball、development/release Launcher 使用同一 dist，npm 安装后可独立运行 `buildr web`。
- [x] 5.4 运行 affected verification、package check、严格 OpenSpec validation 与 residual audit；修复反馈并确保所有实现任务完成。
- [x] 5.5 执行 current knowledge reconcile/inspect 和确定性 OpenSpec convergence/archive readiness，保留归档后 Planning Identity 可解析事实。
