# DSH Buildr Harness

这是独立于 Development 插件的 DSH 桌面入口。正式版点击左侧带 Buildr Harness 官方彩色 H 图标的 **Buildr Harness**，本机开发版点击 **Buildr Harness Dev**，在原窗口使用 Harness 对话。macOS 桌面下中栏顶部提供 48px 轻量工作台顶栏，左侧显示官方彩色 H 图标、名称（开发版带 `Dev` 标识）及当前工作空间名称（收起 DSH 左栏时自动右移避让系统红绿灯与左栏按钮），中间与右侧留白支持拖动窗口和双击放大/缩小 DSH。插件按当前工作空间目录自动连接，优先复用已记住的会话，其次使用当前打开的同目录会话，最后选同目录最近活动的会话。无需选择或绑定。这个连接只借用右栏，不发送消息、不创建 DSH 会话，也不更改其目录。右栏保留原生浏览器、终端和工作区文件，**资源管理器**、**源代码管理**也从原生带图标的入口打开，并在右栏标签和开始页保持无前缀名称。切换同空间的 Harness 对话不切右栏，换工作空间才换对应的右栏；没有匹配时继续用 Harness 自有工作区。对话标题的工作区图标控制右栏；用 `… → 返回 DSH` 或原生左栏退出，不关闭 Harness 服务或重发任务。在 Buildr Harness 中栏与右栏**资源管理器**/**源代码管理**标签内均可随时使用宿主刷新快捷键（macOS 默认 `Cmd + R`）刷新当前页面，并保留编辑保护。

普通网页和账单链接遵循 DSH **设置 → 通用设置 → 网页链接默认打开方式**。如果所选的应用内侧边栏不可用，可以显式改用默认浏览器或复制链接。文件操作和账号授权不走这个链接入口。插件不携带另一份 Harness 核心、Web 或凭据。

## 正式版安装

独立 [Buildr Harness](https://github.com/BuildrAI/Buildr/tree/main/projects/product/services/buildr-harness) 提供 CLI、Web 和系统启动器。可以先装任一方。DSH 中打开插件时，若尚未安装或登记正式 Harness，请完成独立安装并运行 `buildr-harness launcher install`，然后在插件里点「重新检查」。插件不会自行下载、升级或接管开发版。

首个公开 RC 发布后，在 DSH Desktop「添加插件」上方的同一个输入框中粘贴其一：

- npm：`@buildr-ai/dsh-buildr-harness@0.1.0-rc.1`。
- GitHub：从 [BuildrAI/Buildr Releases](https://github.com/BuildrAI/Buildr/releases) 复制 `dsh-buildr-harness-v0.1.0-rc.1` 对应的 `buildr-ai-dsh-buildr-harness-0.1.0-rc.1.tgz` 资产直链。不要填仓库首页或源码下载链接。

两个入口采用同一原包。下方「安装源」只选择 npm 注册表。正式版要求可识别的 macOS 正式 Harness 启动器，当前兼容声明面向 Harness 0.1.x 稳定版和 RC、DSH Desktop 0.2.x 稳定版与预发布版；具体实测组合见对应发布说明，缺少桌面能力时不接管原生 DSH。停用或卸载插件不移除独立应用或用户数据。

## 本机开发

Buildr 自举工作空间交付改变本插件的包输入后，自举会单独更新已从本工作空间安装的开发包，不会安装缺失插件或更新正式版，默认不重启 DSH。若仍在运行，候选已准备但配置不变；正常退出 DSH 后，自举用原交付输入和本次待安装的完整结果接续，仅换装插件并核验，不重复更新网页；确认安装后按原方式打开。用只读预检可先区分是否需要换包。网页变化单独走 Harness 开发运行更新，不必为网页重装本插件。

若明确要求更新开发插件并重开 DSH，可由独立自举执行器完成，不必逐步手动操作。它只处理已核对的现有桌面与本机开发绑定，先验证候选再正常退出；旧版没有宿主回执时需要先按原流程换装一次。安装和新版宿主加载分别确认，不把宿主加载当成页面验收。

- 已做开发桌面验收的宿主包括 DeepSeek Harness Desktop **0.2.2-rc.5**；这不是安装锁。使用桌面应用随附命令和独立 `DSH_HOME` / `--user-data-dir`；先启动该桌面一次初始化，再退出后安装。普通 dsh 或浏览器宿主不是受支持入口。
- 在本服务目录执行 `npm run build:dev -- <产物目录>`。使用桌面随附的 `dsh plugin --profile desktop add /绝对路径/buildr-ai-buildr-harness-dsh-plugin-dev-0.1.0.tgz` 安装到已初始化的独立 `DSH_HOME`；不要修改 `cordis.patch.yml` 绕过加载器。
- 启动桌面前在本地环境提供 `BUILDR_HARNESS_DSH_NODE`（Buildr 的 Node 24.15+ 可执行文件）、`BUILDR_HARNESS_DSH_PACKAGE_ROOT`（安装后 `@buildr-ai/buildr-harness` 的实际绝对目录）与 `BUILDR_HARNESS_DSH_DATA_ROOT`（明确的开发数据域绝对路径）。可用 `BUILDR_HARNESS_DSH_PORT` 选择首次启用的独立 Web 端口，默认 9519；已有匹配端点优先复用，不迁移或覆盖已有端点。独立 Harness 验收包可从 `../buildr-harness/tools/pack-local.ts` 制作，不依赖公开 npm。
- 按[已安装桌面验收](test/desktop-acceptance.md)确认同窗进出、工作空间隔离、文件与 Git 标签及链接偏好。停用或卸载开发插件只释放 DSH 页面，不删除或停止 Harness；退出独立验收后台通过 Harness 的准确实例控制执行。

开发包仅供本机开发和验收，不公开发行。为跟随 Buildr 的日常更新，将 `BUILDR_HARNESS_DSH_PACKAGE_ROOT` 绑定到由自举维护的固定开发包位置，而不是一次性验收包；数据域须与自举激活域匹配。兼容更新后新打开的面板直接使用新版；未交互页面检测到就绪的新资源会自动静默刷新，已交互页面不自动覆盖、也不在底部弹窗打扰，随时按 `Cmd + R` 即可刷新并保留未保存保护。插件自身变更仍由 DSH 管理其加载。
