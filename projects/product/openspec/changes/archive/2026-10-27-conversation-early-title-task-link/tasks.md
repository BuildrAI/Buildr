## 1. 对话应用：早期标题与任务引用

- [x] 1.1 `services/buildr-agent`：执行派发后并发触发早期标题生成（用户输入描述、`generateTitle`、`titleWork` 去重、静默失败、不占用 `titleAttempted`），完成时原兜底路径保留；集成测试覆盖开始执行即回填、手动改名优先、无摘要能力执行方回退。
- [x] 1.2 `services/buildr-agent`：`update` 支持 `taskId` 设置/更换/解除（`assertTask` 校验、`expectedRevision` 保护、`@default` 拒绝），持久化与事件沿用 `save`；集成测试覆盖关联、解除、未知任务拒绝。
- [x] 1.3 `services/buildr-agent`：发送上下文 JSON 增加 `conversationTitle` 与既有 `taskId` 并列，供执行中创建任务保持一致命名。

## 2. HTTP 契约与客户端

- [x] 2.1 `services/buildr`：agent-conversations `update` 契约增加 `taskId`（可空），HTTP 层沿用 `@default` 限制；重新生成 `agent-service-http-dto` 并核对类型。
- [x] 2.2 `services/buildr-web`：客户端 `update` 透传 `taskId`；对话面板提供关联任务入口（当前引用展示、同工作空间任务选择、解除），草稿态写 `draft.setTaskId`；历史/隐藏列表不受影响。

## 3. 验证与知识核对

- [x] 3.1 运行 buildr-agent 相关集成测试与四服务静态检查、单元测试，结果如实记录。
- [x] 3.2 当前认知核对：检查 `knowledge/code-map` 相关说明是否受对话任务引用维护职责影响，按既有建设授权更新受影响段落或记录无影响结论。
