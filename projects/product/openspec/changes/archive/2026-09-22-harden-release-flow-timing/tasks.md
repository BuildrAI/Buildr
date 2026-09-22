## 1. P0 — 发布后有界回读轮询（trusted-publish）

- [x] 1.1 在 `tools/release/trusted-publish.ts` 的 `publishFrozenArtifact` 中，把 `npm publish` 之后的单次 `const after = await read()` 替换为有界轮询循环：循环体仅 `read()` + `assertRegistryArtifact`，命中 `published` 即跳出；默认总窗 ~8min、间隔 ~20s，且窗口/间隔可经 `dependencies.registryWait` 注入。验证：新增单测用极小窗口驱动"首次未命中→后续命中"收敛为 confirmed（已通过）。
- [x] 1.2 轮询循环内对错误分类处理：`read()` 抛瞬态错误（`isTransientReleaseError`）继续等待；`assertRegistryArtifact` 抛 `registry-integrity-conflict` 等非瞬态/conflict 错误立即跳出并 fail closed；窗口耗尽仍未命中则保留现有 `npm-publication-unconfirmed` 阻塞分支与 `nextActions` 文案不变。验证：单测覆盖"窗口耗尽→blocked(unconfirmed)"且断言 publish 仅派发一次（已通过）；integrity 冲突路径由既有 `integrity-conflict` 恢复测试覆盖。
- [x] 1.3 保持 `before.published` 提前 reuse 分支、`publishEffect.state`（unknown→confirmed/not-confirmed）迁移与 `onEffects` 时机不变。验证：既有 `publication-effects` 恢复测试全绿，reuse 路径仍走 `action:'reused'`。

## 2. P2 — launcher 交接超时预算 CI 感知（web instance lifecycle）

- [x] 2.1 在 `src/web/application/instance-lifecycle.ts` 新增导出的 `handoffWaitBudget(env)`：CI（`process.env.CI`）或显式 `BUILDR_LAUNCHER_HANDOFF_WAIT_MS` 覆盖时放大总预算；否则与现有 `attempts=40 × intervalMs=50`（2s）逐毫秒等价。验证：`buildr-web-runtime.test.ts` 新增单测断言非 CI 路径预算等价 2s、CI/覆盖放大、非法覆盖回退默认（已通过）。
- [x] 2.2 将 `handoffWaitBudget()` 结果透传给 `waitForExit` / `waitForInstance` 两处 handoff 等待（`instance-lifecycle.ts:189/209`），不改 `src/web/infrastructure/instance-runtime.ts` 的默认值。验证：tsc 两工程零错误；CI 下 launcher 子进程继承放大预算，由候选中的 `npm-launcher` 集成测试验证真实交接。
- [x] 2.3 错误码语义与本地默认行为等价由 2.1 单测 + 既有 `npm-launcher.test.ts`（候选中运行，CI 下自动使用放大预算）覆盖；未新增重复的慢速集成断言以避免引入额外 flakiness。验证：`launcher_handoff_shutdown_timeout` / `launcher_handoff_concurrent_wait_timeout` 触发条件与文案未改动。

## 3. 当前认知维护（Current Knowledge Maintenance）

- [x] 3.1 执行 `assess`：P0/P2 属内部时序稳健性调优，无公开契约/架构/职责/术语变化。核对 `knowledge/docs/flows/open-source-release.md`（仅以"回读"行为级描述发布配方，未记录"单次回读"或具体时序）与 web 服务文档（未记录 2s 交接预算），均不因本变更失真。结论：知识影响 none，无需更新地图/技术图/解释文档/术语；已按 `human-readable-change-brief` 规范创建同级 `brief.md`。`.buildr/knowledge-impact.yml` 为可选记录且本变更无影响，未改写（现存条目属于非 active 的其他变更）。

## 4. 直接验证

- [x] 4.1 运行改动范围内既有 release 与 web 相关测试：`publication-effects.test.ts`（含 2 条新增 P0 用例）+ `release-authority.test.ts` 共 15 项全绿；`handoffWaitBudget` 单测通过；`tsc --project tsconfig.json` 与 `tsconfig.test.json` 均零错误。
- [x] 4.2 `openspec validate harden-release-flow-timing --strict` 通过；`buildr openspec convergence preflight` 返回 `ready` 且无 blockers。
