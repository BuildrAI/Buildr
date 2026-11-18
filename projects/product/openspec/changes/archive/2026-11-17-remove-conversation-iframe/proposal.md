## Why

共享外壳已交付，完整对话仍通过 iframe 接入，工程上下文依赖跨窗口坐标覆盖。现在将第一方组合改为同页 React 装配，降低布局与通信耦合，保持 Agent 协作为主线。

目标与完成依据见[任务说明](@task/remove-conversation-iframe)。

## What Changes

- Harness 提供完整对话公开组件入口，唯一维护对话状态、发送、审批、停止和恢复；Development 不拼装对话内部零件。
- 第一方组合使用同一页面树，以明确回调与上下文插槽接入工程信息、文件和对象打开，不再使用对话 iframe 或坐标覆盖。
- 保留独立 Harness 网页与现有执行、认证、数据协议；流程图安全渲染容器不变。
- 无后端或数据破坏性变更；前端组合契约由网页嵌入改为公开完整组件，原网页入口仍可使用。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-web-composition`：第一方完整对话同页装配与工程上下文语义插槽，保留旧网页独立入口和状态保全要求。

## Impact

- Harness Web 的公开组合入口、宿主适配、输入区与链接打开；Development 的对话承载和工程适配。
- 更新相关源码边界、组件装配及真实生产浏览器检查，不增加公开 npm 包、动态插件平台或DSH适配。
