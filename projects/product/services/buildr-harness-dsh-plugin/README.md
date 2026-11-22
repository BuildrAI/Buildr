# Buildr Harness DSH 桌面插件（开发版）

这是独立于 Development 插件的 DSH 桌面入口。点击左侧 **Buildr Harness**，在原窗口使用已安装的完整 Harness Web；**返回 DSH** 不关闭 Harness 服务或重发任务。插件不携带 Harness 核心、Web、凭据或本机安装绑定。

## 本机开发

- 目标宿主：DeepSeek Harness Desktop **0.2.2-rc.5**。使用桌面应用随附命令和独立 `DSH_HOME` / `--user-data-dir`；先启动该桌面一次初始化，再退出后安装。普通 dsh 或浏览器宿主不是受支持入口。
- 在本服务目录执行 `npm run build:dev -- <产物目录>`。使用桌面随附的 `dsh plugin --profile desktop add /绝对路径/buildr-ai-buildr-harness-dsh-plugin-dev-0.1.0.tgz` 安装到已初始化的独立 `DSH_HOME`；不要修改 `cordis.patch.yml` 绕过加载器。
- 启动桌面前在本地环境提供 `BUILDR_HARNESS_DSH_NODE`（Buildr 的 Node 24.15+ 可执行文件）、`BUILDR_HARNESS_DSH_PACKAGE_ROOT`（安装后 `@buildr-ai/buildr-harness` 的实际绝对目录）与 `BUILDR_HARNESS_DSH_DATA_ROOT`（明确的开发数据域绝对路径）。可用 `BUILDR_HARNESS_DSH_PORT` 选择首次启用的独立 Web 端口，默认 9519；已有匹配端点优先复用，不迁移或覆盖已有端点。独立 Harness 验收包可从 `../buildr-harness/tools/pack-local.ts` 制作，不依赖公开 npm。
- 确认同窗进入、返回、再进入，选择隔离目录执行并检查真实文件 / Git。停用或卸载开发插件只释放 DSH 页面，不删除或停止 Harness；退出独立验收后台通过 Harness 的准确实例控制执行。

当前包仅供本机开发和验收，不公开发行，不依赖原 Development 插件或 DSH 的会话、模型和任务状态。
