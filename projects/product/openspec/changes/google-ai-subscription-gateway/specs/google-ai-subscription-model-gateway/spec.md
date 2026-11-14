## ADDED Requirements

### Requirement: 内置 Google AI 供应商

Buildr SHALL 使用单一非原生内置供应商展示已授权 Google AI 账号的可用订阅模型。未添加该供应商时，Agent Service SHALL NOT 自动创建账号或后台探测本地代理；添加或运行缺失本地代理组件时，系统 SHALL 按需下载、校验并初始化本地代理，已有安装与凭据 SHALL 被原样复用。Agent Service SHALL 管理本机代理进程生命周期并在退出时同步回收所有持有的代理子进程，并对模型调用校验登录身份。

#### Scenario: 按需下载与已有目录复用

- **WHEN** 用户首次添加 Google AI 供应商且本机缺少 `CLIProxyAPI` 二进制或 `config.yaml`
- **THEN** 系统 SHALL 从官方 Release 下载对应平台安装包并校验内置 SHA-256 后安装到本地目录，同时自动生成回环端口配置与随机凭据
- **AND** 若目标目录已存在有效的代理程序与配置文件，系统 SHALL 直接复用而不重复下载或覆盖已有配置与登录凭据

#### Scenario: 退出 Agent Service 回收代理进程

- **WHEN** Agent Service 收到关闭请求、退出信号或运行时关闭
- **THEN** 系统 SHALL 中止启动中的代理并终止所有由其启动的 `CLIProxyAPI` 服务与登录子进程，不遗留孤儿进程

#### Scenario: 复用已有登录

- **WHEN** Agent Service 观察到本机代理配置域内有效的 Google AI 登录和模型目录
- **THEN** 模型选择器 SHALL 在 Google AI 下展示可供兼容 Harness 使用的模型
- **AND** 已准确识别的旧代理自定义来源 SHALL 退出列表和选择器，旧会话 SHALL 保留历史并在新调用时提示重新选择

#### Scenario: 发起登录

- **WHEN** 用户从内置 Google AI 卡片开始登录
- **THEN** 应用 SHALL 提供 Google 授权页，并在授权成功后重新读取模型和额度

### Requirement: Google AI 额度窗口

Buildr SHALL 在 Google AI 卡片中以 Gemini 和 Claude / GPT 分组展示同一次 daily 响应提供的每周、5 小时剩余百分比及重置时间。

#### Scenario: 刷新额度

- **WHEN** Agent Service 收到完整的四个额度窗口
- **THEN** 应用 SHALL 从一次观察更新两个分组
- **AND** 观察失败时 SHALL 保留上一次已观察额度并标记过期
