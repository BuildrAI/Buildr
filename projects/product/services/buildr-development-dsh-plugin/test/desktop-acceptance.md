# Development DSH 桌面真机验收清单（macOS `0.2.2-rc.5`）

本清单用于有界桌面验收检查 `development-dsh-desktop-acceptance`（在真实 `/Applications/DeepSeek Harness.app` 中运行，不修改共享用户账号配置）。

1. **未授权保护与左栏激活**
   - 直接以普通浏览器/缺失桌面头部向 `POST /buildr-development-desktop/open` 或 `POST /dsh-buildr-development/open` 发请求，确认均返回 `403`。
   - 启动支持版本的 DSH Desktop，确认左侧导航栏紧挨在 `插件`（顺序 0）下方、`自动化任务`（顺序 10）上方，按顺序呈现 `Buildr Harness Dev`（顺序 5）与 `Buildr Development Dev`（顺序 7）与官方彩色图标，名称/图标无混淆且不覆盖旧插件配置。
   - 点击左栏入口，中心区域挂载 `<webview>` 载入 Buildr Development Web（无 `X-Frame-Options` / `CSP` 禁止嵌入错误）；macOS 48px 可拖动顶部栏展示 `Buildr Development` + `Dev` 徽章（正式版无 `Dev` 徽章）。

2. **工作空间联动与原生右侧工作区**
   - 在 Buildr Development 页面进入具体工程工作空间，顶部栏同步展示当前工作空间名称，DSH 自动连接或复用到对应 cwd 会话。
   - 点击或快捷键切换 DSH 原生右侧栏，核对“文件”与“代码库”两个标签不带任何产品名前缀，能分别正常浏览目录树/代码文件内容与 Git 状态；从对话点击定位代码文件时优先切入原生“文件”标签定位对应文件与行号。
   - 切换“工作台 / 工作空间”产品模式正常保持会话与 DSH 宿主态（SPA 路由切换不丢失桌面桥接）。

3. **快捷键刷新、链接偏好与返回 DSH**
   - 焦点位于中心 Buildr Development 面板且无弹窗时按下 `Cmd + R`（或设置中自定义刷新键），仅刷新中心 `<webview>`；焦点在原生右侧栏时不误刷中心页。
   - 从菜单点击 `返回 DSH`，中心面板收起并恢复原 DSH 会话或清面板状态；开发回执写入 `<dataRoot>/dsh-desktop/dsh-development-web-desktop.json`（权限 `0600`），退出后安全清理。
