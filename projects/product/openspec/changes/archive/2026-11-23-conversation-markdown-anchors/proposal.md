## Why

对话把 Markdown 章节附在本机文件路径上交给读取入口，使仍存在的文档报「来源文件不存在」。既有消息也需要能打开，不迁移或编辑历史。

## What Changes

- 在现有本机文件预览中分离 Markdown 文件路径与章节，打开源文件后尝试定位标题。
- 保留现有行号、原样文件路径、权限核验和 HTML 隔离行为。

## Capabilities

### New Capabilities

### Modified Capabilities

- `harness-web-composition`：约定 Markdown 章节链接使用与普通文件一致的来源检查，章节缺失时仍显示文件。

## Impact

Buildr Web 与独立 Harness 共用的对话链接解析和 Markdown 预览；无后端、存储或接口变更。总体目标见[任务说明](@task/conversation-markdown-anchors)。
