## 1. 单一内置供应商

- [x] 接入 Google AI 单一来源，复用已有代理登录与模型目录。
- [x] 按模型选择代理协议，并在调用前比对账号身份。
- [x] 将两个指定自定义来源移出供应商列表和模型选择器，保留历史记录。

## 2. 模型及额度

- [x] 使用 dev 的共享分组展示模型。
- [x] 在 Google AI 卡片显示模型和 daily 响应的四个额度窗口。

## 3. 验收

- [x] 隔离候选使用真实订阅取得 Carbon、Opus 和两组额度，并通过 Codex、Claude Code、Qoder、DSH 二进制完成读文件工具与模型回复往返。
- Qoder CLI 1.1.75 完成真实调用。日常目录现存的 Qoder CLI 1.1.83 没有报告网关模型，返回 `qoder_gateway_model_unavailable`，请求未到 Google。
- [ ] 接管现有本机代理，激活并重启日常 Buildr Dev，重新验收四个 Harness 与界面。
- [ ] 从无代理安装且无 Google 登录的环境验证安装与首次授权。
