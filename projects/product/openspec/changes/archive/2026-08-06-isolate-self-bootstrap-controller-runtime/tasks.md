## 1. Provenance model 与 SQLite guard

- [x] 1.1 梳理 retained source、candidate checkout、canonical Workspace 与 Task Validation Workspace 的现有 identity/probe 输入，并在不依赖 cwd/PATH 的前提下形成可复用 writer-provenance 判定。
- [x] 1.2 在 SQLite 打开、migration 与共享 repository writer 边界接入 fail-closed provenance guard，保证拒绝发生在任何 filesystem/SQLite mutation 前。
- [x] 1.3 为稳定 rejection code、脱敏诊断和普通用户 Workspace 非回归行为补齐 domain/application tests。

## 2. Retained controller dispatch 与验证 Workspace

- [x] 2.1 验证 canonical Task lifecycle mutation 继续由 retained controller 执行，并让候选 runtime 在低层 SQLite writer guard 处失去 canonical 写入资格。
- [x] 2.2 复用 receipt-bound Task Validation Workspace 作为候选独立 Structured Store；其 worktree cleanup 同时回收该 local-only validation 数据。
- [x] 2.3 限制 candidate CLI、HTTP、internal driver 与 Local App 通过共享 SQLite writer guard 只写 validation store；保留候选读取/功能验证能力。

## 3. Local App 与资源隔离

- [x] 3.1 验证 candidate Local App smoke 使用 Task Validation Workspace，且既有 Environment resource owner/cleanup 边界继续适用端口与进程资源。
- [x] 3.2 保证 retained Local App 继续绑定 canonical Workspace，且 CLI/HTTP 的错误路径不会创建 SQLite/WAL/SHM 或污染真实 Task 数据。

## 4. Migration 与最终候选收敛

- [x] 4.1 接线 validation store 从空库按候选完整 migration 链初始化；集成后 retained runtime 继续是唯一可升级 canonical store 的 writer。
- [x] 4.2 确认既有 Content Target、runtime/declaration applicability 与最终 identity gate 已使源码或 migration identity 变化失效；重编号或内容变化时由最终 Candidate 从 validation store 重建并运行受影响验证。
- [x] 4.3 覆盖两个并发候选 validation store fixture，证明临时数据不合并且主库 ledger 不受未集成候选影响；重编号后的重建/重验规则由最终 Candidate workflow 执行。

## 5. 验证与当前认知

- [x] 5.1 为 SQLite、Task Environment、CLI/internal driver、HTTP/Local App 和 package/runtime 运行 canonical rejection、isolated migration、retained activation 与零污染回归测试。
- [x] 5.2 按受影响验证声明运行 Static、Unit、Integration 与 Local App smoke；在最终候选变化时按本 Change 的复用规则重验。
- [x] 5.3 更新 `openspec/knowledge/architecture/technical.md` 与 `openspec/knowledge/services/buildr.md`，复核 glossary 是否仍与既有术语一致，并将 knowledge impact 收敛为 aligned/updated。
- [x] 5.4 对最终 Change artifacts 执行 OpenSpec strict validation；Formal Development、Candidate、Completion Review、Finish、retained activation 与 Change convergence 由 Change checklist 之后的独立 lifecycle 处理。
