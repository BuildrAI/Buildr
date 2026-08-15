## Context

复盘确认：入口聚合已经交付；`.cursor` 与包装校验的拉锯当前不复现。仍要修的是 Agent 引导，不是再造一套收尾检查器。

## Goals / Non-Goals

**Goals:**

- 收尾前用最少步骤提醒「先提交贡献、先对齐主工作区」。
- 开变更只保留一条可执行顺序，且与产品门禁一致。
- 用户能看懂的生活例子保留在任务说明和本变更简报中。

**Non-Goals:**

- 不新增收尾入口缺口码，不把脏工作区/落后远端并进 `task_finish.entry_gaps`。
- 不让产品在变更目录不存在时接受绑定。
- 不改 Finish 五阶段或入口三分类。

## Decisions

1. **问题 1 落在 Skill，不落在产品入口。** 产品已经在更后面用既有失败码拦住脏主工作区和适配冲突。提前检查是为了少折返，不是再发明硬门。提醒必须写在调用 `task finish run` 之前，且不得改回「Agent 自己先串环境再串交接」的旧 fail-fast。
2. **问题 2 以产品门禁为准，改说明而不是放宽校验。** 能走通的顺序是：`openspec new change` → `task update --add-change` → Development `begin`（带齐 disposition）→ 再写 proposal/design/specs/tasks。当前侧栏「写文档前 begin」只适合还没有变更的空列表；一旦稍后绑定变更，研发上下文会过期。新侧栏必须禁止这条相反路径。
3. **实现位置。** 权威正文在产品 `task-finish` Skill 与 OpenSpec 侧栏贡献；随包投射到 workspace Skills。规范增量只改 `agent-task-workflows`。

## Risks / Trade-offs

- 轻量提醒仍靠 Agent 遵守 Skill；不做成产品硬门，可能有人跳过。这是刻意取舍：硬门会扩大收尾契约，超出本次意向。
- 先绑定再 begin，要求脚手架已经存在。这与现有 `task_record_change_not_found` 一致，减少试错。

## Migration Plan

部署后新会话读取新 Skill/侧栏即生效。进行中的任务若已按旧侧栏 begin 且尚无变更，绑定变更后必须重新 begin/planning，不得沿用过期上下文。
