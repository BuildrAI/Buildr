---
name: buildr-desktop
description: 在 Codex 原聊天中绑定 Buildr 任务、查看关联及接收准确的工作交接时使用。
---

# Buildr 原聊天协作

通过 `buildr_codex_panel` 打开当前聊天的任务面板。全局入口 `buildr_codex_connections` 仅查看连接、请求与导航，不发送聊天消息。

接入已移除时，桌面组件可保留安装以显示停用状态，但不得继续绑定或交接，也不得发送聊天消息。已有任务关系、聊天、记忆（Memory）、配置和插件（Plugin）保留；重新确认同一接入后才恢复业务。

用户点击面板发出的身份请求后，先在当前聊天直接执行命令读取 `CODEX_THREAD_ID`；不得委派子智能体（Subagent）代取，不用共享根编号 `CODEX_SESSION_ID` 或模型上下文协议（MCP）工具服务环境代替。用原请求编号、面板编号、工作空间编号和接入编号调用 `buildr_codex_complete_binding`。字段缺失或请求过期时返回明确原因，不推测身份。

收到工作交接时，直接读取本聊天的 `CODEX_THREAD_ID`，确认与交接的 `nativeSessionId` 相同，再调用 `buildr_codex_acknowledge_handoff`。接收回执只证明准确聊天收到请求。若返回 `alreadyReceived:true`，先核对工作现场及已有结果，不重复执行同一交接。随后重新读取任务当前事实，在用户已有授权范围内继续；不因任务链接、绑定请求或接收回执自行启动未授权开发。

工具结果中的固定任务链接可在回复中使用，让已有侧边 Buildr 页面优先复用。`codex://threads/<id>` 只打开原聊天，不证明已发消息或已完成工作。结果不明先查询原请求回执，不自动重复发送或创建聊天替代。

提交说明等一次性生成由 Buildr 自有 Codex 应用服务（App Server）负责；不得在原聊天执行该临时生成，也不得替换桌面后台。DSH 不属于此插件。
