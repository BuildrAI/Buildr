## Context

日常 Buildr Dev 已通过 CLIProxyAPI v8.0.69 获得 Google AI 模型，本机账号和代理配置位于 Buildr Dev 数据目录。

## Decisions

- `google-ai-subscription` 为非原生（非 `linked`）内置单一供应商：未添加时不在后台 60s 轮询中自动探测；用户通过“添加供应商”添加或在已有账号运行缺失本地文件时，从 `CLIProxyAPI` v8.0.69 官方 GitHub Release 按平台架构下载压缩包，校验内置 SHA-256 与安全的 HTTPS/tar.gz/zip 解包写入 `<dataRoot>/CLIProxyAPI/cli-proxy-api(.exe)`，并在缺失 `config.yaml` 时自动分配本机回环空闲端口、生成随机 api-key、管理密钥与隔离 `auth` 目录；若已存在则原样复用、不覆盖现有配置与认证凭据。
- Agent Service 从该目录启动本机代理并在关闭、信号退出或进程退出时同步回收所有拥有的进程（包括启动竞态与登录子进程，先 `SIGTERM` 后兜底 `SIGKILL` 进程组）。外部进程占用端口时拒绝接管。
- 内置供应商通过代理发起 Google OAuth，并读取该配置域中的单一 Google AI 登录。调用前重新比对账号身份。
- 模型目录使用同一个模型来源。Claude 模型使用 Messages 协议，Gemini 和 GPT 模型使用 Chat Completions 协议。Harness 继续使用自己的协议及既有会话租约。
- 从同一次 daily 额度响应读取四个窗口。协议保留分组、百分比、重置时间及观察时间。
- 按本机迁移记录识别两个旧自定义来源。成功观察后从列表和目录移除，并拒绝通过旧绑定发起新调用。
- Antigravity 原生执行器仍使用 `agy` 登录与原生模型策略。
