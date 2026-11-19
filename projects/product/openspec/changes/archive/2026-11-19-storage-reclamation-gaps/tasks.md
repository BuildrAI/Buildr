## 1. 修复无引用工具链对象回收吞吐瓶颈

- [x] 1.1 在 `services/buildr-harness/src/storage/runtime-objects.ts` 中支持复用 `cloneViewReferences`、定点 `targets` 复核以及单轮验证预算（`maxVerifyItems` / `maxVerifyBytes`）
- [x] 1.2 在 `services/buildr-harness/src/storage/files.ts` 中新增 `removeRuntimeObjectBatch`，在同一批次内复用前后系统占用观察与对象引用复核
- [x] 1.3 在 `services/buildr-harness/src/application/storage-maintenance.ts` 与 `src/process/storage-maintenance.ts` 中接入定点复核、单轮验证预算与 `removeRuntimeObjectBatch`

## 2. 独立 Harness 网页静态包按引用自动回收

- [x] 2.1 在 `services/buildr-harness/src/process/web-assets.ts` 导出静态包摘要计算函数，并在 `web-session-store.ts` 与 `web-endpoint.ts` 的在线监听身份中记录可选 `bundle` 引用
- [x] 2.2 新增 `services/buildr-harness/src/storage/web-bundles.ts`，实现会话/票据/监听与运行版本静态包摘要引用收集（不可读时 fail-closed）以及超期无引用包和 `.stage-*` 暂存目录候选生成与复核
- [x] 2.3 在 `services/buildr-harness/src/storage/files.ts` 与 `src/application/storage-maintenance.ts` 中接入 `web-bundle` 自动盘点与回收

## 3. 验证证据目录与集成测试临时目录受管清理

- [x] 3.1 修复 `services/buildr-harness/src/storage/test-artifacts.ts` 的 `transientEvidenceName` 正则以匹配 `buildr-e2e-evidence-*` 等含数字验证类型
- [x] 3.2 新增 `services/buildr-harness/test/support/managed-temp.ts` 并将其接入 `fixture-package.ts`、`storage-maintenance.test.ts` 与 `qoder-model-conversations.test.ts`

## 4. 死租约目录内部符号链接与 Antigravity 原生会话显式回收

- [x] 4.1 在 `services/buildr-harness/src/storage/files.ts` 为 `safeStorageResource` 增加默认关闭的 `allowNestedSymlinks` 选项并在 `native-home` 校验与回收中安全启用
- [x] 4.2 在 `services/buildr-harness/src/executors/antigravity/index.ts`、`src/application/native-session-references.ts`、`src/storage/native-sessions.ts` 与 `src/storage/files.ts` 中接入 Antigravity 原生会话（会话文件、`brain`、`conversations` SQLite 组、`annotations`、`transcripts`）的显式引用证明、dry-run 与确认回收

## 5. 验证与知识核对

- [x] 5.1 在 `services/buildr-harness/test/integration/storage-lifecycle.test.ts` 与 `native-session-storage.test.ts` 补充覆盖上述五项修复与安全边界的自动化测试
- [x] 5.2 在工作树内完成 `buildr-harness-web` 与 `buildr-harness` 构建，运行 `test:static`、单元测试与存储/网页相关集成测试全部通过
- [x] 5.3 核对 `knowledge/docs/architecture/agent-integration.md`（如有需要补充受管静态包自动回收与 Antigravity 显式回收说明，按影响评估结果更新或记录无需修改理由）
