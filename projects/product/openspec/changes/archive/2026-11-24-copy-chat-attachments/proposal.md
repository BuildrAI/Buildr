## Why

复用带截图的用户消息时，目前需要分别复制正文和重新添加附件。

## What Changes

同一 Buildr 网页来源内粘贴用户消息时，正文与原附件一起进入草稿，不自动发送。外部应用仍可粘贴纯文本。

## Capabilities

### Modified Capabilities

- `agent-conversations`: 复制和粘贴用户消息所带的附件。

## Impact

仅修改对话网页和规范，无后端接口或数据迁移，不改变纯文本用户消息的复制行为。
