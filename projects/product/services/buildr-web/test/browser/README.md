# 前端验证与工具替换

项目（Project）的验收与适用声明在 [`verification.yml`](../../../../verification.yml)。本目录维护前端布局和交互断言；`buildr/test/browser-smoke` 继续负责命令行（CLI）、登记、持久化、生产托管组合后的真实用户流程。不因目录名称迁移这些跨服务责任，也不复制同一场景。

## 可重复执行

从 `projects/product/services/buildr` 执行：

```sh
# 使用项目 .node-version 对应的既有 Node.js；PATH 不匹配时显式指定。
export BUILDR_NODE=/absolute/path/to/node
# 两个服务（Service）的锁定依赖，只需准备一次。
tools/development/run-development-npm ci
tools/development/run-development-npm --prefix ../buildr-web ci
# 按 preparation.yml 的 buildr.browser-chromium 准备配套 Chromium；已有缓存会复用。
tools/development/run-development-npm run test:browser:install
# 默认使用配套 Chromium；如需其他兼容浏览器，再显式设置 BUILDR_BROWSER_EXECUTABLE。
# 完整浏览器回归（含本目录的布局场景）。
tools/development/run-development-npm run test:browser:smoke
# 只运行布局；入口归前端服务（Service）。
tools/development/run-development-npm --prefix ../buildr-web run test:browser:layout
```

`BUILDR_NODE` 必须符合项目声明版本；未设置时既有包装入口按 `.node-version` 查找。浏览器检查需要 `buildr` 锁定的 `playwright-core` 和兼容浏览器，不要求安装 Tabbit、Tabbit 命令行（CLI）或任何智能体（Agent）浏览器插件。未指定 `BUILDR_BROWSER_EXECUTABLE` 时使用配套 Chromium，以无头模式（Headless）运行，不扫描个人浏览器；测试执行不下载浏览器。依赖准备、缓存复用和显式路径以[宿主服务说明](../../../buildr/test/browser-smoke/README.md)为准。替换可执行文件仍需实际运行，不能仅凭品牌声称兼容。

入口生成所需数据类型（DTO）和测试辅助产物，构建隔离 `web-dist`，通过真实 HTTP 托管后检查。完整入口只构建一次，各检查组拥有独立临时工作空间（Workspace）、用户配置与浏览器；失败组不会阻止后续无依赖检查组。各用例结束清除页面状态、临时请求拦截和视口设置。用例自己准备其依赖数据，不依赖前一用例成功写入。

`layout` 覆盖 1920、1280、390 宽度的目录信息与操作可达、搜索保留、页面无非预期横向溢出；长文检查真实项目引用、分屏展开后的有界行宽与阅读位置恢复。允许宽表格在自身区域滚动。使用宽松可读范围和实际行为，不固定完整截图或精确样式值。

## 换用户或工具环境

智能体（Agent）先读取适用声明和能力绑定（Capability Binding），再发现现场工具并阅读其真实接口说明。Tabbit、egolite、Codex 内置浏览器都只是可能的工具，不能从名称推断视口、脚本、截图或控制台能力。

| 现场能力 | 可以继续证明 | 必须保留的边界 |
| --- | --- | --- |
| 服务自动化依赖与兼容浏览器可用 | 执行上述真实入口 | 通过不等于已做视觉审查（Visual Review） |
| 没有 Tabbit，有导航、点击、输入与页面读取 | 搜索、详情开关、真实链接、表单反馈 | 不直接运行现有 Playwright 程序；按工具接口重新组合现场检查 |
| 另有视口与页面几何读取 | 代表尺寸的溢出、分屏与正文行宽 | 记录实际尺寸、被测版本和测量结果 |
| 只有截图和点击 | 实际交互与所见视觉检查 | 不声称精确测量；缺少尺寸控制时窄屏要求未覆盖 |
| 没有兼容自动化浏览器，但有现场工具 | 可执行的临时交互和视觉检查 | Playwright 回归未执行；逻辑、类型及其他可执行检查继续 |

替代依据是所需操作与可信证据。已绑定且可用的提供者（Provider）必须遵守；没有绑定时可选适用工具。缺少某能力时报告具体要求，不笼统判定全部前端不可验证，不擅自安装应用。

## 证据和清理

- 长期代码及测试数据在服务（Service）中；项目声明引用真实入口。本次临时探索程序无需提交。
- 可用 `BUILDR_SCREENSHOT_DIR` 指定截图目录，日志由调用者重定向保存。截图不自动算视觉审查（Visual Review），需实际查看并另行说明结论。
- 启动入口拥有临时数据、应用配置、浏览器、HTTP 进程和构建暂存，成功或失败后统一清理；日志与指定截图目录由调用者保留或清理。不得使用真实用户工作空间（Workspace）作为可删除测试数据。
- 报告沿用 `contentIdentity/checks/gaps/conclusion`：`source=command` 表示自动化，`source=agent` 的独立检查分别说明交互与视觉审查（Visual Review）。记录被测提交及差异摘要、实际尺寸与目标、结果、必要相对证据引用和具体未覆盖项；不嵌入完整日志、会话凭证或本机绝对路径。
- 证据包保留到本轮审看结束；向其他用户移交时一并移交被引用的日志、图片及版本摘要。没有正式任务（Task）时直接交付报告；内部登记成功不代表测试通过。
