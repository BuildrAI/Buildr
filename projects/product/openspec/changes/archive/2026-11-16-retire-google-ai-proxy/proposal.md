## Why

Codex 等执行方通过 Buildr 本地 CLIProxyAPI 代理使用 Google AI 订阅模型的路径不稳定，且代理需要额外下载、进程生命周期、OAuth 客户端和静态模型路由适配。Google 官方 Antigravity CLI 已能提供同一订阅账号的模型和官方用量窗口，继续维护代理会增加故障面与凭据扩散面。

## What Changes

- 移除内置 `google-ai-subscription` 供应商及其 CLIProxyAPI 下载、启动、配置、模型目录、路由和额度适配；Buildr 不再提供 Google AI 订阅网关，也不向其他执行器共享 Google 账号模型。
- 升级时从模型账号存储中退役代理账号及由代理自动登记的旧自定义来源，保留历史对话；旧对话下次发送时要求重新选择模型。磁盘上的 `CLIProxyAPI` 目录与登录凭据不自动删除。
- 原生 Antigravity 来源通过受管 `agy -p '/usage'` 读取官方用量，按 Gemini 与 Claude / GPT 分组展示每周、5 小时剩余百分比和重置时间；读取失败时保留上次观察并标记过期，不估算。
- 同步移除代理专属 UI、测试、验证登记和知识说明。

## Breaking Changes

- 已添加的 Google AI 代理供应商与旧代理自定义来源会从供应商列表、模型目录和模型选择器中消失；历史对话保留，但下次发送前需要重新选择模型。
- Buildr 不再接受 `google-ai-subscription` 供应商的新增或推理请求；Google AI 模型只能通过原生 Antigravity 执行器使用。
- 不自动删除 `CLIProxyAPI` 目录、代理登录凭据或历史对话；升级后这些文件保留在磁盘上，由用户决定是否清理。

## Capabilities

- `google-ai-subscription-model-gateway`: REMOVED。整个能力退役，不再提供 Google AI 订阅供应商、代理安装、网关推理或四窗口额度观察。
- `antigravity-cli-execution`: MODIFIED。原生 Google 个人账号来源通过官方用量命令读取并展示 Gemini 与 Claude / GPT 的每周、5 小时额度窗口及重置时间。
