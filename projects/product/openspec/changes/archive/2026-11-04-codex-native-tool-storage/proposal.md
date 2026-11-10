## Why
Codex工具正文在Buildr数据库、文本预览和原生会话重复保存。原生引用读取器还遗漏CommandExecution完成记录。将工具执行内容归属原生，实时交互走SSE，减少本地重复存储与逐条比对开销。

## What Changes
- Codex调用开始就持久化原生身份和编排元数据，正文只走有界实时传输。
- 原生结果可读且引用提交后发布详情就绪，复用entry-detail读取。
- 去掉新Codex工具正文暂存、折叠文本预览和逐条收益判断。
- 按用户澄清，优先复用现有SSE事件结构，把适配器原生输出直接投射给客户端，工具正文不经过Buildr对话数据库。只有实际验证证明必要时再调整协议。
- **BREAKING** 新工具引用编码需升级私有存储写入边界，旧数据保持读取兼容，活动旧后台不能写新格式。

## Capabilities
### New Capabilities
### Modified Capabilities
- agent-storage-lifecycle: Codex工具原生所有权及实时详情，其他执行器继续现有契约。

## Impact
涉及buildr-agent执行器、应用层、正文仓储、私有事件协议，buildr宿主HTTP和buildr-web工具展示。适用知识为agent-integration架构与两份代码地图。无新增服务、依赖、模型调用或运行时激活授权。
