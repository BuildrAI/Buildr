## Why
对话输入框只能上传图片和视频，用户无法直接提交日常文档作为工作材料。增加原件上传及准确来源交付，让智能体按当前权限读取处理；不包含破坏性变更。

## What Changes
- 现有“＋”、拖入及文件粘贴支持常见文档，保留文件名及草稿恢复。
- 文档按原始字节安全保存，通过准确路径、类型与名称交付，不作为图片发送或自动执行。
- 单份文档最多32 MiB，每次附件总数仍最多9份。

## Capabilities

### New Capabilities
无。

### Modified Capabilities
- `agent-conversations`: 增加常见文档附件及原件交付。

## Impact
涉及 buildr-web 输入与附件展示、buildr-agent 校验、草稿存储与执行材料装配、buildr 宿主上传与下载边界；不增加解析依赖，不改变现有图片与视频能力。
