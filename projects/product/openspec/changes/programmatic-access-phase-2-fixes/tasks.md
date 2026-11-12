## 1. 修复

- [x] 1.1 messages 请求体新增可选 permissionMode；省略时沿用最近一轮，显式 full-access 与 send 共用 allowFullAccess 门禁；同步帮助、操作与 OpenAPI。
- [x] 1.2 回推停用只停止对外投递，接管对话五类事件仍写入持久事件流并标记未投递，events 可补查且重新启用不重放。
- [x] 1.3 events 的 after 仅接受上一页 nextCursor 的非负整数序号，非法游标返回 400 programmatic_input_invalid。
- [x] 1.4 activityCounts.active/attention 与 active=true/attention=true 使用同一判定并给出总数；明确已完成未查看属于 active、不属于 attention。

## 2. 验证与交付

- [x] 2.1 定向测试覆盖权限继承、停用补查、非法游标与计数一致性。
- [x] 2.2 四服务全量检查通过，开发版 4458 运行修复后代码。
