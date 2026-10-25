## Why
账号登录和执行程序准备目前共用状态，导致用户误解依赖关系、Codex 登录被跳过及刷新阻塞。用户已确认独立接入原型并授权实现，当前应接通官方模型优先选择和真实刷新；不做破坏性存储迁移。

## What Changes
- 执行智能体与模型分开管理，程序准备不自动登录模型账号，Qoder 基础执行登录单独表达。
- 配置仅保留“智能体”和“模型”两页，不提供默认模型设置；对话切换智能体时优先采用可用的官方模型，支持手动使用其他来源。
- 分源并行刷新并逐个反馈，读取已有目录不重复等待所有上游。
- 采用800px抽屉、上下文窗口K单位，以及模型/滑杆/闪电档位三个紧凑元素。

## Capabilities
### New Capabilities
- `independent-agent-model-setup`: 独立程序与模型接入、官方模型优先选择及局部刷新。
### Modified Capabilities
无。

## Impact
涉及 buildr-agent 的连接元数据、准备及对话选择，buildr HTTP契约，buildr-web设置与对话选择，以及现有 agent-integration 解释。新增字段兼容旧记录，账号和会话保留。
