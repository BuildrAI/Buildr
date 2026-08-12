## Context

Task Finish 的既有顺序是 pre-sync guard、agent-driven canonical sync、post-sync guard、archive。OpenSpec 1.6 的 archive 默认还会应用 change delta；在 canonical 已更新时会因同名 `ADDED` requirement 已存在而失败。

## Goals / Non-Goals

**Goals:** 让已验证的手动 sync 走一次 archive，不产生重复 spec update；保留 fail-closed guard。

**Non-Goals:** 不修改 OpenSpec CLI，不跳过 strict validation、post-sync guard 或 archive 后残留检查。

## Decisions

- 仅当当前 session 已完成 agent-driven sync 且 `post-sync` 返回 `ok: true` 时使用 `openspec archive <change> --skip-specs --yes`；这把选择绑定到可审计证据而非目录猜测。
- 未满足该条件时保持 archive 默认行为，避免把 `--skip-specs` 变成绕过 canonical sync 的快捷方式。
- 用 Skill 文本与 contract test 固化条件；它是单一 orchestrator 的参数选择，不是跨 provider contract。

## Risks / Trade-offs

- [错误跳过 spec update] → 必须先有当前 session 的 sync 与 post-sync 通过证据；否则停止或使用默认路径。
- [OpenSpec CLI 参数变化] → 继续依赖当前 CLI help/strict validation，失败时保留 change。
