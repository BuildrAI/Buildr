## Why
待回答时的新输入被当作同轮补充，消息受理但执行不响应。用户已明确统一所有Agent的输入语义，避免厂家差异和隐含回答。

## What Changes
- **BREAKING** 输入框发送不再自动使用同轮补充：始终创建新轮，结束原问题等待但不补造回答或授权。
- 卡片回答绑定准确原请求，继续原轮；工具审批仍只作用于原请求。
- Agent Service统一语义和调度，Adapter优先映射原生机制；不支持时Service安全隔离新轮并在原生受理后清理旧问题，不连带停止活动工具或后台任务。固定本轮参与者归属，不在执行途中改写。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `agent-conversations`: 统一新输入、新轮、问题清理及同会话安全接续。
- `buildr-web-client`: 输入区不再隐式追加当前轮。

## Impact
对话应用、Web输入分流、Codex/DSH/Qoder回归测试及Buildr技能指引。无需新依赖或存储迁移；历史消息和问题事实保全。
