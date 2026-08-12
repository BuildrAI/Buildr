## Why

Task Finish 已能在已同步的 change 归档时跳过重复 spec update，但没有把 canonical spec sync 必须发生在 pre-sync 成功之后的顺序固化。若 Agent 在 apply 阶段提前写入 canonical spec，guard 会正确报基线陈旧，却迫使收尾撤回并重做同步。自举 workspace 的 runtime projection 也会在 source implementation 已验证后改变 delivery tree；当前规则把它一律视为 implementation-changed，导致受影响验证重复执行。

## What Changes

- 将 active OpenSpec change 的 canonical sync 明确为收尾中的受控阶段：不得在 pre-sync 之前写入 canonical spec；pre-sync 成功后才可按 agent-driven 路径同步，随后必须通过 post-sync，才允许 `archive --skip-specs`。
- 为可证明只包含 Buildr runtime projection 与 receipt 完整性更新的 delivery delta 定义严格的 closeout-metadata-only 例外；仍要求 doctor、component/runtime integrity 与 focused checks，不得把任意生成资产或 source 变更归入该例外。
- 增加 Task Finish 与 canonical OpenSpec workflow 的契约测试，防止时序回退或过宽复用验证证据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: 固化 OpenSpec canonical sync 的收尾时序，并限制 runtime projection-only delivery delta 的验证复用。

## Impact

- `services/buildr/package/targets/workspace/skills/buildr/task-finish/SKILL.md`
- `services/buildr/package/targets/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md`
- `services/buildr/package/targets/workspace/components/buildr/openspec/contributions/task-finish-pre-sync.md`
- `services/buildr/package/targets/workspace/components/buildr/openspec/component.yml`
- `openspec/specs/agent-task-workflows/spec.md`
- `services/buildr/test/contract/task-verification.test.mjs` 及 closeout fixture（如需）
- 不修改外部 `openspec-*` Skills、OpenSpec CLI 或 user/system 级 CLI。
