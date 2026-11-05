## 1. 活跃判断

- [x] 1.1 在 `conversationActive` 的历史分支中，将“`status=unknown`、`executionState` 非 active、且没有 `running` / `unknown` 工具”的保留执行视为不活跃，保留 unknown 记录和诊断。
- [x] 1.2 在列表读取的历史候选中加入带保留 `unknown` 执行的行，按版本匹配的活动头部重新解释 `is_active`，不写数据库。

## 2. 搜索

- [x] 2.1 将搜索条件扩展为每个词项命中对话 `id`、标题或一条用户/助手可见消息；ID 使用不区分大小写的子串匹配。
- [x] 2.2 更新 `querySummaries` 与 `listConversations` 的参数绑定，保持两个入口语义一致，并保持命中片段只来自可见消息。

## 3. 测试

- [x] 3.1 增加活跃回归测试：未受理、无工具、无执行引用的 `unknown` 旧轮不使已完成且已读的对话活跃；running/unknown 工具或 active 执行仍活跃；未读和待回答问题仍活跃。
- [x] 3.2 增加列表回归测试：`is_active=1` 的旧投影在读取时退出 `activeOnly`，排序回到普通历史，读取不写数据库。
- [x] 3.3 增加搜索回归测试：仅 ID 子串命中、大小写不敏感、多关键词 AND、标题/消息搜索保持、仅 ID 命中无消息片段，并覆盖 `listConversations`。

## 4. 当前知识

- [x] 4.1 更新 `knowledge/code-map/technical-layers.md` 中对话仓库的搜索范围与历史未知活跃说明。
- [x] 4.2 更新 `knowledge/code-map/system-services-assets.md` 中 `conversation-activity.ts` 对“没有在途工作的历史未知”的解释。

## 5. 验证

- [x] 5.1 运行 `buildr-agent` 相关静态检查与集成测试，确认新增与既有用例通过。
- [x] 5.2 复核 `93d4491f` 的活动列表读取结果，确认不再出现在 `activeOnly`，且无需数据迁移。
