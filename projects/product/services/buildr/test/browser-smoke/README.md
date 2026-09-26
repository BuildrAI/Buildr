# 浏览器测试依赖

本服务（Service）的浏览器测试使用 Playwright 与配套 Chromium。测试默认采用无头模式（Headless），不打开桌面窗口，不依赖 Tabbit、Codex 内置浏览器或其中的登录状态。`package-lock.json` 固定 Playwright 版本，Playwright 据此选择所需的 Chromium 版本。

## 准备与执行

在 `projects/product/services/buildr` 中执行，Node.js 版本遵循项目的 `.node-version`，必要时通过 `BUILDR_NODE` 指定：

```sh
tools/development/run-development-npm ci
tools/development/run-development-npm run test:browser:install
```

安装入口调用已有 `playwright-core` 下载 Chromium 的无头浏览器程序（Headless Shell）。相同版本已在缓存中时会复用；缺少时下载。它不安装桌面应用，也不改变默认浏览器。默认缓存位置由 Playwright 管理；需要隔离或持久缓存时，准备和测试两阶段都设置同一 `PLAYWRIGHT_BROWSERS_PATH`。Linux 若缺少系统依赖，按 Playwright 的诊断准备，不在测试中自动提权安装。

前端构建依赖也须已准备：在 `projects/product/services/buildr-web` 中运行 `../buildr/tools/development/run-development-npm ci`。随后回到本服务执行已有入口：

```sh
tools/development/run-development-npm run test:browser:core
# 需要完整浏览器回归时：
tools/development/run-development-npm run test:browser:smoke
```

测试运行不自动下载浏览器。缓存缺失或 Playwright 升级后缺少对应版本时，报告具体准备入口；仅受影响的浏览器检查未覆盖，其他可执行检查继续。

已有其他 Chromium 或 Chrome 时，可用 `BUILDR_BROWSER_EXECUTABLE` 显式指定可执行文件；兼容性以实际运行结果为准，不自动扫描或改用个人浏览器。无效的显式路径会报错，不静默回退。取消该变量后恢复默认配套 Chromium。测试日志记录实际浏览器版本、来源及无头模式（Headless）。

## 与临时页面检查的关系

智能体（Agent）使用的临时页面工具独立于上述依赖。当前 Codex 环境可选择隐藏的内置浏览器页面，只在用户审看或接手时显示；其他环境按已选择且可用的能力提供者执行。更换这类工具不会改变自动化测试依赖，也不表示工具能原样执行本测试代码。

测试通过已有隔离入口管理临时工作空间（Workspace）、数据和进程，成功或失败都执行清理。Chromium 缓存供后续测试复用，不作为测试临时数据删除。需要截图时使用已有 `BUILDR_SCREENSHOT_DIR`，调用者负责保存或删除证据目录；日志与截图只证明实际执行的检查，不替代未进行的视觉审查。
