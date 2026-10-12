# Buildr 如何接入 Codex 与 DSH

Buildr 的“智能体”入口自动发现本机 Codex 程序及原生配置来源；用户确认后，保存调用所需的程序与配置位置。发现桌面安装时，还会保存任务关联所需的安装、配置与账号范围。确认接入不会启动模型执行。

登记完成后，分别用于**关联原生会话（Session）**和**独立临时生成**。DSH 的生成接入也由同一操作层管理。

会话（Session）是带身份与上下文的工作单元，可以持续保存或临时使用；对话是其中的交流内容。

![从确认接入到关联与调用](../../archify/system/agent-integration.html)

## 两条链路各管什么

| 链路 | Buildr 负责 | 原生程序负责 |
| --- | --- | --- |
| 原生会话（Session） ↔ 任务（Task） | `codex-desktop` 保存关系，提供双向打开链接 | Codex 保存对话历史、记忆和持续执行 |
| 临时生成 | 业务准备资料，`agent-operations` 选择执行者、调用与校验结果 | 专用进程在临时会话（Ephemeral Session）中完成一次生成 |

关联只保存身份与打开链接，不连接或控制桌面的执行进程；临时生成也不继承原生会话（Session）的内容和记忆。

## Codex 与 DSH 的生成接入

**Codex**：首次生成时，Buildr 用已登记程序启动 `codex app-server --listen stdio://`，通过标准输入输出（stdio）发送结构化请求、接收结果。**DSH**：通过智能体客户端协议（ACP）连接 Buildr 桥接程序，由它组合本机 DSH 原生服务。两者沿用各自原生默认配置，由 Buildr 管理专用进程。

## 会话（Session）与任务怎样关联

一个任务（Task）可关联多个 Codex 原生会话（Session），后者也可关联多个任务（Task）。当前会话（Session）提供准确身份，Buildr 保存关系并返回双向打开入口。关联不复制对话、不发送消息，也不启动执行；此关系与临时生成身份分别保存。

## 运行边界

临时生成按注册身份管理：同一身份依次执行，不同身份可并发。专用进程正常完成后复用，完全空闲 30 分钟回收，退出 Buildr 时关闭；原生会话（Session）不进入这条队列，继续由 Codex 管理。

实现入口：[检测程序](../../../services/buildr/src/modules/agent-operations/infrastructure/codex-discovery.ts) · [确认与调用](../../../services/buildr/src/modules/agent-operations/application/agent-operations-application.ts) · [会话（Session）关联](../../../services/buildr/src/modules/codex-desktop/application/codex-desktop-application.ts)。
