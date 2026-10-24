> 历史讨论与实验记录：保留原结论和当时边界。实现现状以正式规范、当前架构说明及交付报告为准；一次性附件和运行资源已在本次交付清理，不作为当前运行依赖。

# 非桌面 Codex 的官方电脑操作验证与资料核对

日期：2026-10-24。最终结论：通过。Buildr 使用的独立 Codex 0.163.0 应用服务（App Server），配置官方原生电脑操作（Computer Use）客户端后，真实模型完成截图、点击、键盘输入及结果复核。不是当前桌面对话代为执行，也没有安装第三方代理程序。

正式功能、现有账号配置与旧会话未修改。未提交、整合或发布。

## 实际验证

沿用 agent-dialog 隔离工作树；认证仅在私有临时目录复制 Buildr 已获授权的独立登录，不使用桌面默认凭据。工作目录、历史与测试页面均独立。模型为账号实际可用的 `gpt-6.1-sol`，采用普通原生 `thread/start` 与 `turn/start`。

| 阶段 | 事实与结果 |
| --- | --- |
| 原接入配置 | `computer_use` 开关为真，但未配置本机工具；模型报告工具不存在，无界面操作。 |
| 直接启动桌面附带 `@oai/cua-repl` | 模型上下文协议（MCP）握手和工具发现成功；调用卡在可信服务模块初始化。增加普通模块路径不能解决。不是可用配置。 |
| 改为官方原生客户端的 `mcp` 入口 | 同一个独立 Codex 程序发现 `get_app_state`、`click`、`type_text` 等十个工具。 |
| 真实模型执行 | `get_app_state` → `click` 按钮 → `click` 输入框 → `type_text` → `get_app_state`，五次工具调用成功。 |
| 独立页面核对 | 按钮点击一次、输入为 `BUILDR_CU_20261024`；37 条点击、键盘及输入事件均为 `isTrusted=true`。 |
| 图片核对 | 五次调用返回真实图片；已查看最终截图，页面显示准确标记和一次点击。 |
| 本轮结束通知 | 通过独立签名应用服务（App Server）向官方组件发送本次准确会话及回合的 `turn-ended`，退出码为 0；不停止共享组件。 |

Tabbit 仅准备、读取、关闭本轮测试页面；没有用它代替被测工具点击或输入。最初的聚焦尝试被启动器拒绝，随后通过系统 `open -a '/Applications/Tabbit Browser.app' <测试地址>` 打开新的测试页，再开始成功轮次。两张本轮创建的测试页已核对准确地址后关闭。

`official-native-events.json` 保存实际模型消息和工具事件，图片单独保存为 `official-native-1.jpg` 至 `official-native-5.jpg`；`page-events.json` 是独立页面事件。失败轮次仍保留，没有用最终成功覆盖过程事实。

## 成功接法与配置边界

没有更换 Buildr 已选应用服务（App Server）路线，也没有借用当前桌面对话的工具、会话编号或私有连接。调用链是：

```text
独立 Codex 0.163.0 app-server
  → MCP 启动官方 SkyComputerUseClient mcp
  → 官方 macOS Computer Use 组件
  → 目标应用的真实截图、点击与键盘输入
```

本机成功配置见 `native-config.toml`。关键项为：

```toml
[mcp_servers.computer_use_probe]
command = "/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/@oai/sky/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient"
args = ["mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 45
```

路径来自本机已安装的官方桌面组件，不是稳定分发地址或官方公开兼容承诺。独立 npm 安装的 Codex 原生可执行文件和组件均核对 OpenAI 签名；未修改二进制、未关闭签名或信任检查。成功回合采用 `approvalPolicy=on-request`、文件沙箱（Sandbox）为 `read-only`；不能把“完全访问”当作工具安装或系统权限的替代。本机既有权限下成功，没有新授予全局应用权限，也没有修改系统设置。

完整日常接入仍须另验应用授权拒绝/允许、停止与异常清理、服务重启、版本兼容、图片展示及多会话隔离。本次仅证明已授权测试现场的最小闭环，不修改第一版正式范围。

## 官方文档与社区证据分别说明什么

| 来源 | 可以确认的事实 | 不能据此推出的结论 |
| --- | --- | --- |
| [官方 Computer Use](https://learn.chatgpt.com/docs/computer-use) | 公开安装路径围绕桌面插件、macOS 屏幕录制/辅助功能及目标应用授权。 | 没有 CLI 教程，不等于应用服务（App Server）不能调用组件。 |
| [官方 Browser](https://learn.chatgpt.com/docs/browser?surface=cli) | 文档明确说明内置浏览器不提供给 CLI 或 IDE 扩展。 | 不能把此结论扩大为 Codex 不能使用任何浏览器工具。 |
| [官方浏览器扩展](https://learn.chatgpt.com/docs/chrome-extension) | Chrome 等外部浏览器的官方控制流程通过桌面应用与扩展设置。 | 并非一个面向任意客户端的独立浏览器部署教程。 |
| [官方 App Server](https://learn.chatgpt.com/docs/app-server) | 提供模型上下文协议（MCP）的工具发现与调用，以及客户端动态工具（dynamicTools）。 | 协议存在不等于所有桌面组件已随 CLI 安装。 |
| [Paseo 使用记录：openai/codex #35659](https://github.com/openai/codex/issues/35659) | 社区报告 Paseo 以 `codex app-server` 调用官方电脑操作，并暴露结束后捕获流持续运行的生命周期问题。 | 是社区使用与故障报告，不是官方独立部署承诺。 |
| [tmustier/codex-computer-use-mcp](https://github.com/tmustier/codex-computer-use-mcp) | 开源适配器通过签名应用服务（App Server）和官方原生 `mcp` 客户端转发工具；明确要求官方组件且未获 OpenAI 背书。其代码提供了此次成功路径的核对依据。 | 不能把适配器称为官方 SDK，也不能据此宣称无需安装官方组件。 |
| [ashhart/ComputerUse](https://github.com/ashhart/ComputerUse) | 提供其他客户端及命令行接入官方运行组件的实现；Chrome 仍依赖官方扩展连接。 | 其 README 明确 Chrome 操作尚未真实验证，不是浏览器完整闭环成功证明。 |
| [openai/codex #33599](https://github.com/openai/codex/issues/33599) | 有 CLI 加载官方工具、评论者以 CLI 执行真实工具以及连接 Chrome 只读列页的报告；同时指出内置浏览器受桌面对话路由约束。 | 标题“CLI works”不代表内置浏览器在任意 CLI 会话可用。评论属于社区报告，尚未在本机验证 Chrome。 |

因此要分开表达：

- 电脑操作（Computer Use）：独立应用服务（App Server）调用官方组件已在本机成功；仍依赖桌面安装提供的运行组件。
- 内置浏览器（Browser）：官方明确不提供给 CLI；不能凭共享配置自动复用桌面对话的浏览器。
- Chrome 等外部浏览器操作（Browser Use）：有社区接入线索及局部成功报告，但本机尚未验证官方浏览器扩展路线。用原生电脑操作点击浏览器页面，不等于验证了这条专用路线。

## 对 Buildr 的影响

无需因此改为对接桌面对话，也无需更换应用服务（App Server）。若后续采用，应把本机工具作为独立可检测的能力，明确其安装来源、版本、系统授权、图片结果与回合结束清理；官方原生工具和通用第三方执行器分别声明。现有统一会话与各家原生上下文恢复设计可以保留。

`result.json` 保存最终结论与前序失败事实；`cleanup.json` 保存临时资源处置结果。正式产品清单的 180 个文件与既有摘要逐项核对，没有变化。临时凭据、完整工具目录和云端账号元数据不进入证据目录。
