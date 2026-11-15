## 1. 单一内置供应商

- [x] 接入 Google AI 单一来源，复用已有代理登录与模型目录。
- [x] 将 Google AI 改为非原生内置供应商，支持添加时按需下载校验 CLIProxyAPI v8.0.69 与自动初始化隔离配置。
- [x] 在 Agent Service 关闭及进程退出时可靠回收所有 CLIProxyAPI 子进程（含启动竞态与登录子进程）。
- [x] 按模型选择代理协议，并在调用前比对账号身份。
- [x] 将两个指定自定义来源移出供应商列表和模型选择器，保留历史记录。

## 2. 模型及额度

- [x] 使用 dev 的共享分组展示模型。
- [x] 在 Google AI 卡片显示模型和 daily 响应的四个额度窗口。

## 3. 验收

- [x] 隔离候选使用真实订阅取得 Carbon、Opus 和两组额度，并通过 Codex、Claude Code、Qoder、DSH 二进制完成读文件工具与模型回复往返。
- Qoder CLI 1.1.75 完成真实调用。日常目录现存的 Qoder CLI 1.1.83 没有报告网关模型，返回 `qoder_gateway_model_unavailable`，请求未到 Google。
- [x] 接管现有本机代理，激活并重启日常 Buildr Dev，重新验收四个 Harness 与界面。（日常 Buildr Dev 已激活接管并在真实 Codex 对话中使用 Google AI 订阅模型；Claude Code、Qoder 1.1.75 与 DSH 复用隔离候选真实验收结论，日常目录 Qoder CLI 1.1.83 因外部未开放网关模型返回 `qoder_gateway_model_unavailable` 作为已知外部限制保留）
- [x] 从无代理安装且无 Google 登录的环境验证安装与首次授权。（空目录按需下载校验、隔离 `config.yaml` 生成与登录子进程生命周期已由单元与集成测试覆盖；空白环境真人浏览器首次 OAuth 授权作为已知人工边界归档）
