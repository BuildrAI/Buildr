## Why
Codex已完成工具正文原生单份存储，DSH与Qoder仍在Buildr重复保存工具正文，DSH高频文字还会逐片触发保存与展示快照。现在将已验证的共享链路扩展到两者，减少重复持久化和无效同步工作。

## What Changes
- DSH、Qoder新工具从首次原生事件建立身份引用，Buildr仅保存元数据，不保存正文、预览或缺失片段，不逐条判断收益。
- 两适配器从准确原生会话按调用读取详情；复用既有SSE、有界实时内存和详情就绪切换。
- DSH采用主线已交付的累计文字合并与让出事件循环，补验控制、问题和工具边界立即有序交付，不叠加合并层。
- **BREAKING**：旧后台不能读取新增的DSH/Qoder语义引用；采用时使用存储兼容版本边界，活动旧后台先自然释放。本次实现不启用共享后台。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `agent-storage-lifecycle`：原生单份工具正文范围扩展至DSH、Qoder，补齐原生定位和实时引用切换。

## Impact
影响buildr-agent的DSH/Qoder事件适配、原生详情读取、引用绑定及存储兼容边界；buildr-web复用折叠元数据和按需详情规则，更新直接相关知识与验证。无新增依赖或公开事件类型；不包含附件压缩归档、历史批量转换或共享环境启用。
