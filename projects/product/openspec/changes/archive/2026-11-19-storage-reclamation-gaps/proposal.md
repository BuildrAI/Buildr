## Why

本机持续使用过程中排查出五处影响存储收敛的机制缺口：无引用工具链内容对象（`toolchains/objects`）在数量较多时因盘点与执行反复全量哈希校验并逐项观察系统占用而触发退避、难以消化；独立 Harness 网页静态包（`harness-web/bundles`）只有写入没有淘汰；含数字的验证类型证据目录（如 `buildr-e2e-evidence-*`）及部分测试临时目录缺少受管标记或漏匹配而残留；包含内部符号链接的旧租约目录（`native-home`）被误堵在安全校验外；以及 Antigravity 的无引用原生会话尚未纳入显式引用证明与回收范围。

## What Changes

- 修复无引用工具链对象（`runtime-object`）盘点与回收逻辑：支持有界验证上限、定点目标复核以及批次共用系统占用观察与对象引用核验，避免单轮 CPU 过高与反复全量校验导致滞留。
- 新增独立 Harness 网页静态包（`harness-web/bundles`）按活跃页面会话、票据、在线监听与保护运行时摘要的自动回收，状态不可读时 fail-closed 保留。
- 修正瞬时验证证据目录名称模式以覆盖 `buildr-e2e-evidence-*` 等含数字类型标识，并为 `buildr-harness` 集成测试临时目录提供受管 `.buildr-test-state.json` 标记。
- 允许死租约目录（`native-home`）在根及祖先严格禁止符号链接的前提下，安全核验并解除内部由当前用户拥有的符号链接而不跟随其目标。
- 将 Antigravity 原生会话纳入显式引用证明与干跑/确认回收范围，保持周期性自动维护不删除原生会话。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-storage-lifecycle`：新增独立 Harness 网页静态包按引用自动回收要求；补充工具链无引用对象有界分批回收与定点复核要求；扩展瞬时验证证据目录识别含数字类型；扩展显式原生会话回收至 Antigravity，并明确死租约目录内部符号链接的安全解除边界。

## Impact

- 涉及 `projects/product/services/buildr-harness` 的 `storage/`、`application/storage-maintenance.ts`、`application/native-session-references.ts`、`process/`（`storage-maintenance.ts`、`web-assets.ts`、`web-session-store.ts`、`web-endpoint.ts`）、`executors/antigravity/index.ts` 及相关集成测试。
- 保持外部 HTTP/CLI 契约兼容；`WebListenerIdentity` 仅增加可选 `bundle` 字段以向下兼容既有运行状态文件；自动维护依然绝不自动删除原生会话。
