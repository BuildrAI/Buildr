## 取舍

- 右栏「资源管理器」「源代码管理」通过 DSH 原生 `tab.actions.bindCommands({ refresh })` 响应宿主 `page.refresh` 快捷键，复用右栏焦点判定，确保不影响原生浏览器标签的刷新。
- 中栏 Harness 不将 `shortcuts` 写入插件硬依赖清单，而是通过可选 `ctx.inject(['shortcuts'], ...)` 读取当前 `page.refresh` 有效绑定（缺失时回退到平台默认 `Cmd+R` / `Ctrl+R`），并订阅 `dshDesktop.keyboard`（不可用时退回 `keydown`）：收到 `webview` 按键时精确比对中栏 `lease`（`frameName === chatLease`），收到主窗口 `keyboard` 事件时确认未聚焦右栏且无开启的弹窗，才刷新中栏页面。
- 开发模式仍对未交互页面低频探测并静默刷新，检测到页面已交互后即停止弹窗或底部浮条干扰，改为随时通过快捷键刷新，且继续走 `location.reload()` 以保留编辑器 `beforeunload` 保护。
- 在注册右栏标签类型及自定义 `sidebar.right.pane.tab.title` 槽位时统一渲染无前缀的工具名，使已持久化到 `localStorage` 的历史标签无需关闭重开即可立即去除 `Buildr ` 前缀。
