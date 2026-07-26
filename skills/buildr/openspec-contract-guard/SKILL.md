---
name: openspec-contract-guard
description: 创建、同步或归档 OpenSpec change，且需要建立契约基线、检查 active change 冲突、canonical drift 或同步结果时使用。此 Skill 是 Buildr 的 OpenSpec sidebar，不修改外部 openspec-* Skills。
metadata:
  author: buildr
  version: "1.1"
  supportedOpenSpec: "1.6.0"
---

# OpenSpec Contract Guard

本 Skill 只保留 OpenSpec 1.6 未提供的 Buildr 契约保证：proposal 与 delta 的基线对齐、并行 active change 冲突、sync 前 canonical drift、以及 sync 后的 receipt 与未触达 Requirement 证据。

OpenSpec 1.6 负责 delta 格式与 Requirement 结构、单个 change 的规范校验、canonical spec 重建和 archive 的场景保全检查。先运行上游 `openspec validate <change> --strict`；本 Skill 不重复实现这些解析或 archive 安全规则。

本 Skill 不修改外部 `openspec-*` Skills、外部 OpenSpec CLI 或本机 CLI 安装。

## 1. 建立 Buildr 基线

change artifacts complete 且上游严格验证通过后运行：

```bash
openspec validate <change> --strict
buildr openspec baseline create <change> --project <project> --target <workspace> --json
buildr openspec check <change> --stage proposal --project <project> --target <workspace> --json
```

基线位于 change 的 `.buildr/contract-baseline.json`，绑定 touched Requirement 的 canonical facts。普通 check 不会自动创建或刷新基线。

历史 active change 缺少基线时，先报告无法证明原始事实；只有用户确认“以当前 canonical specs 作为采用基线”后，才能运行：

```bash
buildr openspec baseline create <change> --project <project> --target <workspace> --adopt-current --json
```

delta 范围变化后，先重新运行上游 strict validation，再审阅并显式使用 `--update`；不得把 stale、incomplete 或 adopted warning 表述为已通过门禁。

## 2. 同步前后门禁

任何 canonical spec sync 前：

```bash
openspec validate <change> --strict
buildr openspec check <change> --stage pre-sync --project <project> --target <workspace> --json
```

只有 `ok: true` 才能调用上游 sync。pre-sync 检查 proposal/delta 与基线关系、active change 之间对同一 Requirement 的冲突、canonical Requirement 是否仍匹配基线，并写入本次同步 receipt。

完成上游 sync 后、archive 前：

```bash
openspec validate <change> --strict
buildr openspec check <change> --stage post-sync --project <project> --target <workspace> --json
```

post-sync 验证 receipt 绑定的预期结果，并确认未触达 Requirement 没有被删改。失败 finding 必须包含 operation、expected/actual 摘要和确定性的 next action；失败时停止 archive、commit、push 和 cleanup；不要删除 sidecar、自动采纳 canonical 或重跑 pre-sync 掩盖结果。

## 3. 失败处理

- `active_conflict`：列出冲突 change 和 Requirement；先完成或重新规划其中一个 change。
- `baseline_stale`：当前 canonical facts 已变化；停止 sync，审阅前序 change，再更新或重建当前基线。
- `baseline_missing` 或 `baseline_incomplete`：补齐显式基线；历史 change 必须得到采用确认。
- `post_sync_*`：停止归档与 Git 动作，保留 worktree，报告实际/预期摘要。
- upstream strict validation 失败：修复上游诊断后再运行 Buildr 门禁。
- CLI/Component version 不一致：使本机 OpenSpec CLI 与 Component 声明一致；Buildr 不代为安装。

用户可见状态必须包含 change、stage、baselineState、conflicts/findings 和 `nextActions`。外部 `openspec-*` Skills 继续承担 explore、propose、update、apply、sync 与 archive 的原有职责。
