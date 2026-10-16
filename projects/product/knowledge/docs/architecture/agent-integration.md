# Buildr 如何接入 Codex 与 DSH

Buildr 的“智能体”入口发现本机 Codex 和 DSH，用户确认候选后保存准确的安装与配置范围。Codex 登记程序和原生配置来源；DSH 登记当前渠道中已启用 Buildr 插件的桌面后台。发现、确认和检查接入都不发送模型请求。

接入支持两项独立能力：**按给定材料生成结果**，以及**关联原生会话（Session）与任务（Task）并双向打开**。会话（Session）是带身份与上下文的工作单元；一次生成的运行（Run）与原生会话（Session）关系分别管理。

![从确认接入到关联与调用](../../archify/system/agent-integration.html)

## 两条链路各管什么

| 链路 | Buildr 负责 | 原生程序负责 |
| --- | --- | --- |
| 原生会话（Session） ↔ 任务（Task） | 按提供者（Provider）保存精确身份、多对多关系和观察版本，提供双向打开入口 | Codex 与 DSH 保存对话历史、工具执行和上下文 |
| 一次生成 | 业务准备有界资料，`agent-operations` 选择执行者、排队、取消并校验结果 | Codex 专用应用服务，或 DSH 当前桌面模型服务，完成本次调用 |

关联不复制对话，也不发送消息或启动模型执行。一次生成不继承任何已有关联会话（Session）的内容、记忆或工具；两条链路可以分别使用。

## Codex 与 DSH 怎样执行生成

**Codex**：首次生成时，Buildr 用已登记程序启动 `codex app-server --listen stdio://`，通过标准输入输出（stdio）调用临时会话（Ephemeral Session）。该专用进程由 Buildr 按需复用和回收，原生桌面聊天继续自行运行。

**DSH**：Buildr 通过本机回环连接（Loopback TCP）连接已运行桌面中的 Buildr 插件，再调用同一宿主（Host）的模型服务。正式调用由 `DshDesktopProvider` 承担；桌面、插件或准确范围不可用时返回可恢复错误，不另起 DSH 生成进程，也不退回旧智能体客户端协议（Agent Client Protocol，ACP）链路。

DSH 在每次请求时读取桌面当前默认的模型（Model）及提供者（Provider）。普通调用继承桌面推理级别（Reasoning Effort）；提交说明明确请求轻量生成，由同一模型（Model）的原生声明选择最低受支持级别，经准备调用确认后只作用于本次请求，桌面聊天设置保持。实际采用值随运行（Run）记录，详见[提交说明怎样生成](agent-integration-generation.md)。它共享当前模型服务及其生效的模型中间件；这不等于继承当前聊天所选模型（Model）或完整聊天执行环境。调用不带 `sessionId`，不会创建原生聊天记录，也不运行会话（Session）级工具、技能（Skill）、记忆和执行钩子（Hook）。

## 会话（Session）与任务怎样关联

Codex 与 DSH 的原生会话（Session）都可以关联多个任务（Task），一个任务（Task）也可以关联两种提供者（Provider）的多个会话（Session）。关系保存在工作空间（Workspace）中；旧 Codex 文件、身份、版本和深层链接（Deep Link）保持兼容。

DSH 的关联身份来自目标原生执行直接提供的 `DSH_SESSION_ID`，不能用桌面焦点或临时生成身份推测。任务页按提供者（Provider）展示关系：Codex 使用原有 `codex://threads/…` 链接；DSH 由桌面插件（Plugin）唤起已核验安装的窗口，选中准确会话（Session），并观察目标聊天在前台显示后才确认成功。右侧网页占用焦点时，通过原生输入框接口恢复目标聊天的键盘焦点，保留草稿与光标，不发送消息。当前 DSH 官方唤起接口只定位主窗口；多个客户端（Client）无法唯一对应时明确报告，不猜测或广播。反向打开任务（Task）也要求目标会话（Session）已经关联，并核对实际任务页地址；复用页面时保护已有草稿。

关系查询按提供者（Provider）隔离失败。一方读取失败时，另一方的新结果仍可见，失败方已有结果明确标记为上次读取。桌面离线或接入移除不会删除旧关系，仍可以查看和按观察版本解除。

## 接入与运行边界

同一登记身份的生成依次执行，不同身份可以并发；原生聊天不进入这条队列。Codex 空闲 1 小时后回收专用进程；DSH 空闲 30 分钟或 Buildr 退出时只释放自己的连接和请求，不停止桌面或影响其他聊天。取消也只针对本次请求。

检查旧 DSH 登记时，只有安装、配置和渠道准确匹配，才保留原编号、名称及默认选择并确认新后台；不能唯一确认时保留旧事实、要求重新确认。移除接入仅移除调用登记、断开关联配置，不删除模型账号、原生历史或会话（Session）关系。

## 实现与图示来源

本图展示接入、生成和关系三项职责，不展开完整原生聊天执行体系。当前事实入口：[Codex 发现](../../../services/buildr/src/modules/agent-operations/infrastructure/codex-discovery.ts) · [DSH 发现](../../../services/buildr/src/modules/agent-operations/infrastructure/dsh-discovery.ts) · [确认、排队与生命周期](../../../services/buildr/src/modules/agent-operations/application/agent-operations-application.ts) · [DSH 生成提供者](../../../services/buildr/src/modules/agent-operations/infrastructure/dsh-desktop-provider.ts) · [桌面插件桥](../../../services/dsh-plugin/plugin/desktop-server.ts) · [关系聚合](../../../services/buildr/src/modules/native-session-links/application/native-session-links-application.ts) · [DSH 桌面导航](../../../services/buildr/src/modules/dsh-desktop/application/dsh-desktop-application.ts) · [任务页入口](../../../services/buildr-web/src/features/task/components/TaskAgentSessions.tsx)。
