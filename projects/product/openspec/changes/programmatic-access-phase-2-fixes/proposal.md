## Why

GrokBot 第二期联调发现四处与已交付契约不一致的行为：单步续聊丢失 full-access、回推停用时事件不落盘、events 接受非法游标、activityCounts 与 active/attention 筛选不一致。需要在不扩大授权的前提下修正并补齐回归验证。

## What Changes

- messages 请求体增加可选 permissionMode；省略时沿用对话最近一轮，显式 full-access 与 send 共用 allowFullAccess 门禁。
- 回推停用只停止对外投递；接管对话的五类事件仍写入持久事件流并标记未投递，events 可补查，重新启用不重放。
- events 的 after 仅接受非负整数游标，非法值返回 400 programmatic_input_invalid。
- activityCounts.active/attention 与对应筛选使用同一判定并返回总数；明确已完成未查看属于 active、不属于 attention。
- 同步 /help、operations 与 OpenAPI。

## Impact

- 程序接入列表、单步续聊与事件补查契约保持一致。
- 不新增授权，不改变五类事件范围、投递重试或真实接收地址验证范围。
