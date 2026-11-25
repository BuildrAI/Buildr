# 技术设计：@buildr-ai/dsh-buildr

- `projects/product/services/buildr-development-dsh-plugin/src/{metadata.ts,channel.ts,handoff.ts,client.tsx}` 与 `cordis.patch.yml`、`tools/build-dev.ts`、`tools/verify-desktop-pair.ts` 同步更名至 `@buildr-ai/dsh-buildr` / `@buildr-ai/dsh-buildr-dev`、`Buildr` / `Buildr Dev`、`/dsh-buildr/open`，并将图标更换为四段亮色等距 `B` 标；保持 `buildr-development-desktop/v1:` 与 `x-buildr-development-desktop` 不变以兼容已发布的 `0.1.0-rc.67` 及后续 `0.1.0-rc.68`。
- `skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs` 将开发包名切换为 `@buildr-ai/dsh-buildr-dev` 并将 `@buildr-ai/dsh-buildr-development-dev` 纳入 `legacyNames` 自动卸载迁移。
- `skills/buildr-release/scripts/harness-release-admission.ts` 将 `targets` 更新为 `['harness','dsh-buildr-harness','dsh-buildr']`，通过 `historicalTargets = ['dsh-buildr-development']` 兼容读取已合入 `main` 的历史准入条目，同时阻止新追加或发布已退役目标。
