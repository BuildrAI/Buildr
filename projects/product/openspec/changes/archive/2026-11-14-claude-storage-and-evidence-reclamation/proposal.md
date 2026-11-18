## Why

1. 智能体在受管隔离环境（`$TMPDIR` 指向绑定目录 `tmp/`）中运行 Buildr 静态检查与单元测试时，`createVerificationEvidencePaths` 生成的临时证据目录（`buildr-<kind>-evidence-*`）若未被调用方显式清理，不会进入 `testArtifactCandidates` 自动回收。
2. `native-sessions` 与 `native-home` 回收目前仅覆盖 `codex` 与 `dsh`，尚未覆盖同样使用 `connections/claude-code/model-bindings/<64hex>` 的 `claude-code` 会话与死租约绑定目录。

## What Changes

- 扩展 `storage/test-artifacts.ts`：识别带有完整受管瞬时生命周期标识的过期 `buildr-*-evidence-*` 目录（`timing.json` 校验通过、未处于进程占用且超过稳定窗口），纳入既有自动维护清理。
- 扩展 `storage/native-sessions.ts`、`application/native-session-references.ts` 与 `application/handoff-sources.ts`：将 `claude-code` 纳入显式原生会话与无引用死租约绑定目录的引用证明、干跑与确认回收范围。

## Capabilities

- `agent-storage-lifecycle`：补充瞬时验证证据目录的条件回收与 Claude Code 原生会话/死租约目录的显式引用证明回收。
