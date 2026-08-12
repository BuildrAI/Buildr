# OpenSpec 同步时序与 runtime projection 收尾边界

本 Change 将 OpenSpec canonical spec 同步固定为 pre-sync 成功后的受控收尾阶段，并为可证明的 Buildr runtime projection delta 建立严格、可审计的验证复用边界。

## 背景与问题

已有 contract guard 能在 canonical sync 前后检查一致性，但 apply guidance 未明确禁止提前写入 canonical specs；这会使 pre-sync 基线陈旧，并把本可避免的失败推迟到收尾。另一方面，已验证的 package source 投影到自举 workspace runtime 时会产生 runtime 文件与 receipt 差异；在来源、diff 与完整性都可证明时，重复执行相同 affected 验证没有相称收益。

## 目标与非目标

- 目标：固定 `pre-sync → agent-driven canonical sync → post-sync → archive --skip-specs` 顺序，并将其投射到 apply/sidebar 与 Task Finish。
- 目标：仅对 Buildr 受管 runtime projection 与 receipt 的精确差异复用 implementation evidence，同时保留 component integrity、doctor 与 focused checks。
- 非目标：不改写外部 OpenSpec Skills、CLI 或其安装行为；不为 lockfile、source、任意 generated asset 或归因不明 diff 放宽验证。

## 受影响对象与核心流程

受影响对象是执行 OpenSpec Change 的 Agent、Task Finish workflow 和 Buildr 自举 workspace 维护者。Agent 在 apply 阶段只修改 change artifacts 与实现；Task Finish 先取得 pre-sync receipt，执行 canonical sync，再取得 post-sync receipt，最后以 `--skip-specs` 归档。若随后 delivery tree 只出现受管 runtime projection 与 receipt，则按严格 subtype 做 focused checks；否则按 implementation-changed 重新验证。

## 关键变化

- 在 OpenSpec apply sidebar 与 Task Finish pre-sync contribution 中禁止提前 canonical sync。
- 将 Task Finish 的 closeout sequence、失败停止条件与 `runtime-projection-only` subtype 写入 source Skill、fixture 和 contract test。
- 维护 lifecycle current knowledge 与术语，明确受控同步和 runtime projection-only 的适用边界。

## 影响、风险与兼容性

这是 workflow/Skill 契约强化，不变更外部 OpenSpec ownership。过宽的 runtime 例外由来源、精确 diff、component check、doctor 和 source identity 的合取条件限制；任一缺失都回退为 implementation-changed。

## 验收摘要

apply 不能在成功 pre-sync 前预写 canonical specs；Task Finish 只能在 pre-sync、同步、post-sync 均成功后归档；runtime projection-only 仅在所有证据条件满足时复用验证，否则重跑同级 requiredAssurance。相关 contract、strict OpenSpec 与 affected verification 通过。

## 技术 artifacts

- `openspec/specs/agent-task-workflows/spec.md`
- `services/buildr/package/targets/workspace/skills/buildr/task-finish/SKILL.md`
- `services/buildr/package/targets/workspace/components/buildr/openspec/contributions/`
- `services/buildr/test/contract/task-verification.test.mjs`
