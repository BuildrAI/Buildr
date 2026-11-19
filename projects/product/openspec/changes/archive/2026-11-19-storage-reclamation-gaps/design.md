## Context

本变更围绕 Buildr Agent Service（`buildr-harness`）存储维护子系统，解决现实使用中暴露出的五处回收盲区与性能瓶颈，保持“默认只读、条件核验、fail-closed 保守保留、自动维护不触碰原生会话”的既有原则。

## Goals / Non-Goals

- **Goals**:
  - 消除 `runtime-object` 回收在数千个过期对象下的 O(N) 重复 SHA-256 哈希与逐项 `lsof` 阻塞，使后台维护单轮耗时可收敛且能持续消化积压；
  - 接入 `harness-web/bundles` 内容寻址网页静态包的自动引用保护与淘汰；
  - 修复 `buildr-e2e-evidence-*` 正则漏匹配，并让核心存储相关集成测试临时根目录接入 `.buildr-test-state.json` 受管生命周期标记；
  - 让包含内部临时符号链接（例如 Codex `apply_patch`）的 `native-home` 死租约目录能够通过安全核验并安全解除；
  - 让 Antigravity 的多类原生会话文件与目录接入显式引用证明和显式回收链路。
- **Non-Goals**:
  - 不变更自动维护永不自动删除原生会话的根本边界；
  - 不新增外部 CLI 命令、新页面或自动定时删除策略；
  - 不合并 Antigravity 的整个 `.gemini/` 配置根目录或共享认证状态，只精确回收按 UUID 隔离的单会话对象。

## Decisions

1. **工具链内容对象有界分批回收**
   - `runtimeObjectCandidates` 增加可选 `targets` 与 `maxVerifyItems` / `maxVerifyBytes` 参数；后台维护默认每轮最多全量哈希验证 256 个待回收对象或 256 MiB 字节即停止继续对余项做哈希，待下一维护周期接续；
   - `inventoryAgentStorage` 收到 `targets` 时将目标集合直接传入 `runtimeObjectCandidates`，避免 `collectAgentStorage` 执行重盘点时再次全量扫描并哈希全部对象；
   - 在 `files.ts` 新增 `removeRuntimeObjectBatch`，参考 `removeSmallResourceBatch` 的原子批模式：在一把 `storage` 锁下先一次 `observeStorageUse()`，最多改名 256 个通过逐项哈希/链接/只读/权限/无占用核验的对象为 `.reclaim-<uuid>`，再统一调用一次 `observeStorageUse()` 与 `cloneViewReferences()` 复核版本和 `nlink === 1` 后删除，任意异常或失效恢复原路径。
2. **独立 Harness 网页静态包回收**
   - `WebListenerIdentity` 增加可选 `bundle?: string` 字段，在 `HarnessWebEndpoint` 绑定监听时一并写入 `session-state.json`，兼容缺少该字段的旧状态文件（缺失时仍依赖 `currentRuntime`、`pendingRuntime` 和存活实例的 `build/harness-web-dist` 内容摘要保护）；
   - 新建 `storage/web-bundles.ts`：任何读取失败或格式无效（`session-state.json`、`instance.json`、`pending.json`、`instances/*.json` 或对应 `harness-web-dist` 不可读）均返回 `complete: false`，使 `web-bundle` 全部保留并报告原因；
   - 已验证无引用 `<64hex>` 包需超过 24 小时稳定窗口且不在进程占用中才清理；遗留 `.stage-*` 目录超过 15 分钟稳定窗口且无占用即清理。
3. **验证证据正则与受管测试临时目录**
   - 将 `test-artifacts.ts` 中 `transientEvidenceName` 由 `/^buildr-[a-z-]+-evidence-[A-Za-z0-9]+$/` 放宽为 `/^buildr-[a-z0-9-]+-evidence-[A-Za-z0-9]+$/`；
   - 新增测试辅助 `test/support/managed-temp.ts` 创建带 `.buildr-test-state.json`（`producerPid: process.pid`, `completed: false`）的 `buildr-test-state-*` 根目录，测试正常结束后标记 `completed: true` 再删除；若测试进程意外退出，后台 `hostTempArtifactCandidates` 可按现有受管规则自动回收。
4. **死租约目录内部符号链接安全核验**
   - `safeStorageResource` 增加可选 `{ allowNestedSymlinks?: boolean }`（默认 `false`，不改变任何既有调用方严格行为）；
   - 仅当 `allowNestedSymlinks === true` 时，`target` 自身及其到 `root` 的每一级祖先依然必须通过 `safeStoragePath`（非符号链接、归属本用户），而在递归检查 `target` 内部子项时允许本用户拥有的符号链接作为叶子条目通过（不跟随其指向路径）；
   - `fs.rmSync(retired, { recursive: true })` 在 Node.js 中仅解绑符号链接本身，绝不会递归删除外部目标目录或文件；此选项仅在 `nativeHomeCandidates` 与 `removeStorageCandidate` 的 `item.kind === 'native-home'` 上启用。
5. **Antigravity 原生会话显式回收**
   - 在 `antigravityExecutorDescriptor.runtimeTraits` 声明 `nativeSessionReclamation: true`，自动纳入 `nativeSessionProviders()`；
   - `native-session-references.ts` 的路径解析增加识别 `antigravity-sessions/<uuid>.jsonl`、`antigravity-cli/brain/<uuid>`、`antigravity-cli/conversations/<uuid>.db` 与 `antigravity/transcripts/<uuid>.jsonl`；
   - `native-sessions.ts` 区分 `sessionProviders`（含 `'antigravity'`）与 `homeProviders`（维持 `codex`、`dsh`、`claude-code`，因为 Antigravity 采用连接级单一 `home/` 而无 `model-bindings/<hash>`）；
   - 识别 Antigravity 连接下按 UUID 隔离的会话文件与目录，并对同一 UUID 的 `conversations/<uuid>.db` 及其 `-wal`/`-shm` 伴生文件执行同组占用保护（任一伴生文件被进程占用即整组标为 `storage_in_use`），且删除顺序保证伴生文件不早于被引用主库产生异常状态。对目录型 `native-session` 放宽单对象节点检查上限（如 50,000 节点），避免多文件 `brain/<uuid>` 被误标为 `storage_path_unsafe`。

## Risks / Trade-offs

- **哈希预算截断可能延长单批消化周期**：当对象超过 256 个或 256 MiB 时分多轮完成，但每轮 CPU 与耗时保持在数秒内，不会触发 `StorageMaintenance` 的数十分钟级退避，总吞吐反而大幅提升。
- **`brain/<uuid>` 等嵌套目录大小**：Antigravity 单条 `brain` 目录可能含数百至上千文件；将 `native-session` 节点上限提升至 50,000（同时 `safeStorageResource` 仅核验路径归属与非软链），若超过上限仍安全拒绝删除并报 `storage_path_unsafe`。
- **兼容旧运行状态**：`WebListenerIdentity.bundle` 为可选字段；若运行中恰好使用旧字段格式的状态文件，会通过 `currentRuntime` 与存活 `readProcessInstances` 的静态资产目录内容实时算出摘要并保护，不会误删在线静态包。

## Migration Plan

无需数据迁移，所有存储格式变更均为只读增强或可选字段扩展，支持直接原地升级与回退。
