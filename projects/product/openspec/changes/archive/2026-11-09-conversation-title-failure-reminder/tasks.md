## 1. 最终失败回填提醒标题

- [x] 1.1 在 `services/buildr-agent/src/application/conversation-application.ts` 定义提醒文案常量「生成标题错误，请手动修改」，`titleEligible` 同时接受中性名称与提醒标题（仍要求 `titleOrigin === 'default'`）；验证 `npm run typecheck` 通过，既有标题测试不受影响。
- [x] 1.2 在 `recordTitleFailure` 的 `completion` 阶段，当 `titleOrigin === 'default'` 且标题仍为“新对话”时写入提醒标题，保留原有 `titleState`（failed/unavailable）与诊断原因；验证测试断言标题变为提醒且 `titleState` 仍为失败。
- [x] 1.3 确认真实与显式手动路径不被覆盖：早期阶段失败保持中性名称，`manual` 阶段失败不改写当前名称或已有提醒，迟到自动结果仍可把提醒替换为真实生成标题；验证对应测试通过。

## 2. 历史失败对话启动补齐

- [x] 2.1 在 `services/buildr-agent/src/persistence/conversation-repository.ts` 增加只读候选查询：`titleOrigin='default'`、标题为“新对话”、`titleState` 为 `failed` 或 `unavailable`；验证查询只返回符合条件的记录。
- [x] 2.2 在 `recoverInterrupted()` 中于中断标题修复之后核对当前参与者的早期与完成两个阶段是否都已消耗（复用 `titleAttempts` 的旧标记迁移），满足时通过正常保存路径写入提醒；验证历史记录在启动后详情与 `listAll` 都显示提醒。
- [x] 2.3 保证补齐幂等且冲突隔离：已显示提醒的记录不再命中候选，单条 revision 冲突或读取失败不影响其他恢复工作；验证重复启动不重复写入且其他恢复流程继续。

## 3. 行为测试

- [x] 3.1 在 `services/buildr-agent/test/integration/conversations.test.ts` 覆盖自动标题两个阶段都失败后的提醒标题、失败状态保留与工作执行不受影响；验证该测试文件通过。
- [x] 3.2 覆盖早期失败但完成兜底尚未失败时保持“新对话”，以及随后完成阶段成功时得到生成标题；验证测试通过。
- [x] 3.3 覆盖用户手动改名优先、迟到失败不覆盖手动名称、显式手动生成失败保留当前名称或提醒；验证测试通过。
- [x] 3.4 覆盖提醒标题下切换新参与者仍可尽早尝试、切回已尝试参与者不重置预算；验证测试通过。
- [x] 3.5 覆盖历史失败记录启动补齐后 `read` 与 `listAll` 均返回提醒标题；验证测试通过。

## 4. 当前知识与文档校准

- [x] 4.1 更新 `knowledge/docs/architecture/agent-integration.md` 的标题说明，补充“两个有界阶段都失败后回填提醒标题、历史记录在启动时补齐、手动入口优先”；验证描述与实现一致。
- [x] 4.2 校准 `knowledge/code-map/technical-layers.md` 中 `conversation-application.ts` 的短标题职责描述，并在 `projects/product/.buildr/knowledge-impact.yml` 记录本任务的知识影响；验证条目来源与状态完整。

## 5. 验证与交付前检查

- [x] 5.1 运行 `npm run test:static`（`agent-source-boundaries`、`agent-typecheck`）与 `npm test`（`agent-unit`），验证通过并保留真实结果。
- [x] 5.2 运行 `npm run test:integration -- --group agent-integration-conversations`，验证对话生命周期与标题行为测试通过。
- [x] 5.3 运行 `openspec validate conversation-title-failure-reminder --strict` 与 `buildr openspec convergence preflight`，确认规划材料无错误后再进入实现完成判断。
