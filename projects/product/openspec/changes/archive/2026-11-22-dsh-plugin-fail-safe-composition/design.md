## Context

见 [proposal.md](proposal.md)。DSH `0.2.x` 保持高频预发布演进，而组合包内置的增强生产者与客户端模块基于固定源码基线构建。在没有 DSH 宿主端安全模式或运行期插件隔离的前提下，组合包自身必须做到“能接管则增强、不能接管则自动退让”，确保绝不阻断 DSH 启动或导致退出死锁。

## Goals / Non-Goals

**Goals:**
- 保持 `>=0.2.0-0 <0.3.0-0` 宽宿主版本声明，不牺牲对兼容版本的可用性；
- 取消静态 `disabled: true` 补丁，通过启动期只读契约核对决定是否接管；
- 接管失败或宿主销毁时实现有序、有界、无死锁清理与自动回滚；
- 建立按宿主版本与组合身份建键的跨进程启动熔断机制，防止极端未捕获崩溃反复阻断启动。

**Non-Goals:**
- 不在本次修改 DSH 桌面端应用本体代码，也不为其他第三方插件提供宿主端隔离；
- 不升级 `0.2.0-rc.2` 源码 SDK 基线或重写 `dsh-plugin` 业务协议。

## Decisions

### 1. 取消静态禁用补丁，全部交由 `BuildrComposition` 动态接管
- **取舍**：此前 `cordis.patch.yml` 在 Loader 解析最早期静态设置 `disabled: true`，导致不兼容时官方模块根本不会挂载，DSH 因缺少必需服务而 `StartupError`。改为不写入静态禁用条目，只有当 `BuildrComposition` 通过全部检查准备接管时才在内存中动态 `suspend` 原条目，并在 `loader/patch-context` 中仅在 `this.active === true` 时拦截重挂载。
- **替代方案**：收窄 `peerDependencies` 到单一版本号（如 `0.2.0-rc.2`）。否决原因：DSH 小版本/预发布频繁迭代，会导致插件在几乎所有新版本上彻底无法启用。

### 2. 只读运行期契约探测（`compatibility.ts`）
- **取舍**：在动态接管前，通过 `ctx.loader.internal.import` 只读导入待替换的官方模块与增强模块，比较导出形态（类构造器 vs `{ apply }` 对象）与原型链方法集合（及已激活实例公开方法）。对于 `dsh-tools` 新增 `setExecutor` 或 `dsh-client-ui-trajectory` 改为类服务等破坏性接口演进，可在实例化任何增强模块前精准发现并退出。
- **替代方案**：仅捕获插件实例化异常后再回滚。否决原因：部分模块依赖缺失或客户端接口变更在实例化前即可廉价发现，先验后换能避免无意义的组件震荡，也避免触发热更新或异步副作用。

### 3. 激活后同级必需条目审计与先恢复后释放的回滚顺序
- **取舍**：因为 `BuildrComposition` 本身运行在 Cordis Loader 初始化事务内，内部绝不能调用 `ctx.loader.await()`（否则死锁）；改为仅针对 `REQUIRED_SIBLING_ENTRY_IDS` 上存在 `inertia` 的非禁用条目在有界超时内等待并审计其 `state === 3` 或 `error`。回滚时先恢复被挂起的官方 `tools`/`skill`/`preset-*` 条目，再释放 `agent-loop` 的 `NativeConfigurationOwner`（否则 `agent-loop` 恢复时会因依赖 `tools` 仍被挂起而激活失败），最后重起失败的必需同级条目。

### 4. 宿主销毁与运行期卸载分离的有界清理
- **取舍**：识别上下文处于整体销毁阶段（`isContextDisposing`）时，在 `withinReload` 中跳过 `hmr` 排他队列，在 `NativeConfigurationOwner.release` 中传入 `restoreStock: false` 跳过重新 `entry.init()` 原生 `agent-loop`，并对所有 `await` 应用短超时上限（`boundedAwait`）。仅在运行期热卸载或变体切换时执行完整还原。

### 5. 跨进程启动熔断器（`circuit-breaker.ts`）
- **取舍**：对纯静态探针无法预判的进程级致命异常（如增强模块内部发起异步未捕获崩溃），采用 `profileDir/data/buildr-composition/startup-guard.json` 记录 `(hostVersion, compositionIdentity, state, pid)`。接管前标为 `attempting`，稳定运行过确认窗口后标为 `ready`；若其他进程留下 `attempting` 或已 `tripped` 且版本未变，则直接跳过接管。更换 DSH 版本、升级插件包或正常停用插件时自动失效或清理。

## Risks / Trade-offs

- [同级静态模块签名相同但运行期新增必需事件/配置语义] → 由“激活后同级审计 + 回滚”与“跨进程启动熔断器”双重兜底。
- [静态补丁移除后，正常兼容版本的增强接管发生在 `buildr-composition` 激活瞬间，原生模块可能已入队初始化] → 沿用已有 `suspend()` 的私有虚拟依赖与 `fiber.await()` 等待旧实例停稳机制，并在 `loader/patch-context` 针对仅 `active` 状态清理在途重试，经 `composition-lifecycle` 完整回归验证并发与 HMR 边界。
- [熔断状态文件处于只读文件系统的受限配置档] → 所有持久化读写内部捕获 IO 异常并降级为无状态探测，不阻断启动。

## Migration Plan

- 无需数据迁移；重新构建组合包后，`cordis.patch.yml` 自动不再含静态禁用条目；既有停用或降级用户无需手动清理配置即可由插件重新检测兼容性。
