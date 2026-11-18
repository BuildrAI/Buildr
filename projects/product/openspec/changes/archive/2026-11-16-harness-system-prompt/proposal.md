## Why
用户希望跨 Harness 统一使用简洁高效的表达要求。现有固定交互政策已有四家原生注入，但缺少用户可编辑配置、版本和明确生效事实。现在实施默认启用的「Buildr Harness 系统提示词」，无破坏性迁移。

## What Changes
- 当前配置域提供单一提示词的编辑、启停和恢复默认，使用已确认的简洁文案。
- 原生追加而非替换、用户消息拼接或网关改写；补齐 Qoder CN，公开 Antigravity 支持状态。
- 新轮次固定提示词快照；配置变化采用新运行时与原生上下文，保留旧执行控制和对话历史。

## Capabilities
### New Capabilities
- `harness-system-prompt`: 统一系统提示词配置、原生交付与版本观察。
### Modified Capabilities
无。

## Impact
Harness 配置应用、执行器、对话编排、HTTP/进程契约和 Harness 网页。无需新依赖，不接管外部桌面，不更改权限，不影响辅助标题。
