## Why

新的智能体（Agent）与模型（Model）配置已提供统一账号和执行能力，旧 Codex、DSH 接入继续维护另一套登记和默认选择。提交说明仍依赖旧链路，必须先迁移，才能完整退役。用户已明确授权删除外部桌面关联且不保全其历史。

## What Changes

- 提交说明经统一模型能力执行，沿用有界材料、输出校验、取消与迟到结果保护。
- **BREAKING** 删除旧接入的界面、命令和接口（API），停止装配旧生成后台。
- **BREAKING** 删除外部会话（Session）与任务（Task）关联、桌面导航及其本机关系数据，不迁移、不备份；不触及外部桌面聊天或账号。
- 保留内部对话的可选任务引用，不增加任务门槛。
- DSH 插件保留 Buildr 页面入口，移除旧生成与导航桥接。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-operations`: 以统一模型的有界单次生成替代旧登记、选择和原生后台。
- `codex-desktop-collaboration`: 退役外部桌面关联及历史。
- `native-session-association`: 移除全部外部桌面会话关系。
- `agent-runtime-connections`: 删除新旧并存要求，统一单次生成职责。
- `buildr-web-client`: 内部对话与单次生成保持独立，移除外部入口。
- `dsh-desktop-integration`: 删除旧生成与会话导航桥接，保留页面入口。

## Impact

涉及主包、智能体私有库、前端及 DSH 插件；更新技能源、契约生成、相关测试和失效说明。此变更不提交、集成、推送或发布；历史删除仅限 Buildr 自有旧登记和关系文件。
