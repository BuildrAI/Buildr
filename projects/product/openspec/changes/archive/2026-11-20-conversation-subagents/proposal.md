## Why

主流程等待子智能体回传时，用户看到的却可能是「模型已结束」和普通命令列表。[任务说明](@task/conversation-subagents)保留目标与验收依据。

## What Changes

- 增加同一对话内的派发卡片、快捷入口和只读详情侧栏，可切换子智能体并返回准确派发位置。
- 接入 Claude Code 子任务与 Codex 子线程的原生事实，区分等待、已知进度和仅后台运行。无破坏性迁移。

## Capabilities

### Modified Capabilities

- `agent-conversations`：呈现有证据的原生子智能体与主流程依赖。

## Impact

Harness 适配器、对话投影、公开可选字段及共享对话界面。无新权限、服务或依赖。
