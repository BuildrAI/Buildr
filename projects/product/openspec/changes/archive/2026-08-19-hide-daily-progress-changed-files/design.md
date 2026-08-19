## Context

项目详情「每日演进」按日视图当前渲染四问、提交列表与「变更文件」。canonical 规范要求 MUST 展示变更文件。用户反馈路径清单干扰阅读，希望只保留四问与提交。

Application 仍把 `files` 写入 `.buildr/daily-progress/...yml`，Agent Skill 与 CLI 继续收集/inspect 该字段。本次只改人类可读 Web 展示与对应 SHALL。

## Goals / Non-Goals

**Goals:**

- Web 按日/按人视图不再出现「变更文件」标题与列表。
- OpenSpec 与当前认知中的展示承诺与实现对齐。
- 已有含 `files` 的文件继续可读；record 仍可带 `files`。

**Non-Goals:**

- 不从 schema / YAML / HTTP inspect JSON 删除 `files`。
- 不改四问、提交、按人/按任务分组、Task 反向关联或 DatePicker。
- 不做 UI Preview。
- 不改 CLI `record` 对 `files` 的校验与保存要求。

## Decisions

1. **只隐藏 Web 渲染**：在 `DailyProgressPanel` 移除 `FileList` 使用（可删除未用组件）。HTTP 仍可返回 `files`；前端忽略。
2. **按任务分组本就不展示文件列表**（现有实现 `{group !== 'task' ? <FileList .../> : null}`）；改完后三种分组均不展示变更文件。
3. **规范用 MODIFIED**：改「必须展示」为「必须展示四问与提交，且 MUST NOT 展示变更文件」，避免读者以为仍要求展示路径清单。
4. **知识维护**：reconcile 时更新描述「提交与变更文件」的 knowledge 段落，不另开 Change。

## Risks / Trade-offs

- Agent 仍写入 `files`，文件体积与写入成本不变；换取兼容与后续可恢复展示。
- 若有人依赖页面扫路径做审查，需改看 CLI inspect 或本地 YAML；这是明确产品选择。
