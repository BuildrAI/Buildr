## REMOVED Requirements

### Requirement: 内置 Google AI 供应商
**Reason**: Buildr 不再通过 CLIProxyAPI 或任何本机代理向其他执行器提供 Google AI 订阅模型。代理安装、进程生命周期、独立 OAuth 客户端、静态模型目录和协议路由全部退役；Google AI 模型只经原生 Antigravity 执行器使用官方登录。

**Migration**: 模型账号加载时移除 `google-ai-subscription` 账号，并在可核实 `<数据根>/CLIProxyAPI/buildr-quota.json` 映射时移除其自动登记的旧自定义来源。历史对话保留，下次发送时按缺失模型来源提示重新选择。磁盘上的 `CLIProxyAPI` 目录、配置和登录凭据不自动删除，由用户决定是否清理；Buildr 不再读取或启动它们。

### Requirement: Google AI 额度窗口
**Reason**: 额度窗口随代理供应商一起退役，改由原生 Antigravity 来源通过官方 `/usage` 命令读取和展示。

**Migration**: 原生 Antigravity 账号卡片继续显示 Gemini 与 Claude / GPT 的每周、5 小时剩余百分比和重置时间；代理供应商的旧额度观察不再保留或展示。
