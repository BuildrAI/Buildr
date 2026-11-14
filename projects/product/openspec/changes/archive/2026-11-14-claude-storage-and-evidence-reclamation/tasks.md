## 1. 瞬时验证证据自动回收

- [x] 1.1 在 `storage/test-artifacts.ts` 中支持校验受管瞬时验证证据目录（`buildr-<kind>-evidence-*` + `timing.json`）并保留既有路径与重启复核安全边界。

## 2. Claude Code 原生会话与死租约目录回收

- [x] 2.1 在 `storage/files.ts`、`storage/native-sessions.ts`、`application/native-session-references.ts` 与 `application/handoff-sources.ts` 中纳入 `claude-code` 引用收集与显式干跑/确认回收。

## 3. 测试与验证

- [x] 3.1 补充 `storage-lifecycle.test.ts` 与 `native-session-storage.test.ts` 测试覆盖并通过完整检查。
