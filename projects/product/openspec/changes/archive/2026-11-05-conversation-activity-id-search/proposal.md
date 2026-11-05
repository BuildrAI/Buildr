## Why

已完成的对话可能因为一条历史保留执行长期占据活动区：该执行 `status=unknown`、未受理、没有工具和执行引用，也没有 `resourcesReleased`，按当前规则会一直被算作活跃。用户既看不到仍在进行的工作，也无法通过查看或关闭让它退出列表。同时，对话 ID 已在列表中展示和复制，但搜索只能匹配标题与可见消息，无法按 ID 子串定位。

## What Changes

- 历史旧轮只在仍有真实在途工作时保持对话活跃：`executionState=active`，或存在 `running` / `unknown` 工具；仅剩 `unknown` 状态且没有在途工作的旧轮不再算活跃，`unknown` 记录与送达未知事实继续保留。
- 列表读取对已有活跃投影按同一规则重新解释，`93d4491f` 这类记录无需修改数据库即可回到普通历史顺序；下一次保存或标记已读会自然收敛。
- 对话搜索增加对话 ID 子串匹配，与标题、用户/助手可见消息同级；英文大小写不敏感，多关键词仍要求全部满足。
- 无破坏性变更：API 形状、前端交互和数据库结构不变；搜索只扩大可命中范围，不改变排序或分页语义。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`: 调整历史未知执行的活跃判断，允许仅 ID 子串命中对话搜索。

## Impact

- `services/buildr-agent/src/domain/conversation-activity.ts`：历史执行活跃判断。
- `services/buildr-agent/src/persistence/conversation-repository.ts`：列表读取修复与搜索条件。
- `services/buildr-agent/test/integration/conversation-activity.test.ts`：活跃与搜索回归测试。
- `knowledge/code-map/technical-layers.md`、`knowledge/code-map/system-services-assets.md`：同步当前行为说明。
- 不涉及 API 契约、前端组件、数据库迁移或批量回填。
