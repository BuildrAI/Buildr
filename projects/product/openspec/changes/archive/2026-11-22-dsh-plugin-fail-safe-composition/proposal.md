## Why

DeepSeek Harness（DSH）在 `0.2.x` 预发布阶段高频演进，Buildr DSH 插件（`@buildr-ai/buildr-dsh-plugin` 与 `@buildr-ai/buildr-dsh-plugin-dev`）按照已有契约声明支持 `>=0.2.0-0 <0.3.0-0`。然而当前增强组合在打包期生成 `cordis.patch.yml` 时静态禁用 DSH 官方核心模块，并在运行期直接替换为基于 `0.2.0-rc.2` SDK 构建的模块：当宿主（如 `0.2.2-rc.5`）新增必需服务方法或变更客户端契约时，增强模块直接触发 `StartupError`，且 `buildr-composition` 在销毁回退时因与宿主生命周期互等而挂起，进而阻断整个 DSH 启动。收窄到单一 DSH 版本会严重损害可用性，因此需要让增强组合具备不兼容或失败时自动退让放行原生 DSH 的保护能力。

## What Changes

- 移除组合包 `cordis.patch.yml` 对 DSH 官方核心及客户端模块（`tools`、`agent-loop`、`skill`、`preset-*`、`ui-trajectory`、`ui-settings-agent-loop`）的静态 `disabled: true` 声明，改为运行期条件接管。
- 在 `plugin/composition` 新增只读宿主契约探针（`compatibility.ts`），接管前检查待替换模块的导出形态、类原型方法与已激活服务方法是否完全覆盖当前宿主模块，不兼容时放弃接管并保留官方模块。
- 在激活接管后审计增强条目与必需同级条目（`tool-executor-native` 等）状态；发生异常时自动停用增强子树、先恢复官方根与预设模块再释放 `agent-loop` 配置拥有者，并尝试重启受影响同级必需条目。
- 改造 `NativeConfigurationOwner` 与 `BuildrComposition` 清理逻辑：在宿主销毁阶段跳过 `hmr` 锁与原生 `agent-loop` 重启，所有等待均设短超时，消除 `dispose()` 死锁。
- 新增按 `(hostVersion, compositionIdentity)` 建键的跨进程启动熔断器（`circuit-breaker.ts`），未确认就绪即异常退出的进程将在后续同版本启动时自动跳过增强组合，版本变更或用户停用后自动重置。
- 在 `buildrCompositionRuntime.status()` 与网关 `activation()` 诊断中暴露明确的降级状态，且在降级模式下保持薄侧栏网关入口与既有持久化会话可用。

## Capabilities

### New Capabilities

（无新增独立 capability）

### Modified Capabilities

- `dsh-plugin-distribution`: 增加增强组合在宿主不兼容或启动异常时自动降级放行原生模块、有界退出清理及跨进程启动熔断的约束要求。
- `dsh-buildr-provenance`: 增加来源增强组合在降级为原生模式时的状态表达与数据保全约束。

## Impact

- 影响文件：`projects/product/services/dsh-plugin/plugin/composition/*`、`projects/product/services/dsh-plugin/plugin/src/index.ts`、`projects/product/services/dsh-plugin/plugin/src/types.ts`、`projects/product/services/dsh-plugin/plugin/README.md`、`projects/product/services/dsh-plugin/tools/build-composition.ts` 及相关单元/集成测试。
- 兼容与破坏性：无破坏性变更；`buildrCompatibility`、`peerDependencies`（`>=0.2.0-0 <0.3.0-0`）与 `buildrCompositionRuntime.inspect()` 签名完全向后兼容。
