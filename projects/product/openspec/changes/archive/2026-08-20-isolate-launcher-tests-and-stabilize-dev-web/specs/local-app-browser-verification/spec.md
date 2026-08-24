## MODIFIED Requirements

### Requirement: Buildr 必须提供隔离的本机应用浏览器冒烟验证
Buildr Product MUST 提供可重复执行的真实浏览器验证，并 MUST 在独立临时 Workspace、独立 Web Data Root 和随机 loopback 端口中运行，不读取或修改开发者真实 Workspace、released Web 或 Development Web。浏览器冒烟验证 MUST 使用无界面浏览器（Headless Browser），并 MUST NOT 调用平台 Launcher、系统默认浏览器、系统通知或其他图形用户界面（GUI）入口。

#### Scenario: 执行浏览器冒烟验证
- **WHEN** 环境具备 Node、npm 和受支持的 Chrome/Chromium 可执行文件
- **THEN** 验证 MUST 自动创建临时 Workspace fixture、启动隔离本机应用并驱动无头浏览器
- **AND** 执行结束后 MUST 关闭测试拥有的浏览器与服务器并清理测试拥有的临时目录
- **AND** MUST NOT 打开系统默认浏览器标签页、显示 Launcher 弹窗或改变真实 Development Web instance receipt

#### Scenario: 浏览器环境不可用
- **WHEN** 无法解析或启动受支持的浏览器
- **THEN** 验证 MUST 以明确诊断失败或由测试编排标记为环境阻塞
- **AND** MUST NOT 下载浏览器、访问外部系统、回退操作真实 Workspace 或启动真实平台 Launcher
