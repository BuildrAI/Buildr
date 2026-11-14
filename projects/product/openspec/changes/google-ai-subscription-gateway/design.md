## Context

日常 Buildr Dev 已通过 CLIProxyAPI v8.0.69 获得 Google AI 模型，本机账号和代理配置位于 Buildr Dev 数据目录。

## Decisions

- Agent Service 从该目录启动本机代理并在关闭时回收所拥有的进程。外部进程占用端口时拒绝接管。
- 内置供应商通过代理发起 Google OAuth，并读取该配置域中的单一 Google AI 登录。调用前重新比对账号身份。
- 模型目录使用同一个模型来源。Claude 模型使用 Messages 协议，Gemini 和 GPT 模型使用 Chat Completions 协议。Harness 继续使用自己的协议及既有会话租约。
- 从同一次 daily 额度响应读取四个窗口。协议保留分组、百分比、重置时间及观察时间。
- 按本机迁移记录识别两个旧自定义来源。成功观察后从列表和目录移除，并拒绝通过旧绑定发起新调用。
- Antigravity 原生执行器仍使用 `agy` 登录与原生模型策略。
