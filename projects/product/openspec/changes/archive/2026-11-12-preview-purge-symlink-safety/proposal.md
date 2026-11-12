## Why

`preview stop --purge` 的安全检查把解析到实例根之外的符号链接一律判为越界并拒绝清理，而 agent-service 启动时按共享设计在实例内创建 `toolchains/cache-targets/*` 宿主缓存声明链接，导致任何真正运行过的预览实例托管 purge 必拒；普通停止按设计保留数据，GB 级隔离根因此无法经产品路径回收。删除实际使用 `fs.rmSync(recursive)`，只 unlink 链接条目、从不跟随链接，该拒绝规则不保护任何真实不变量。

## What Changes

- 移除 `assertPurgeTargetSafe` 的实例目录遍历与越界符号链接拒绝；保留清理目标必须位于预览根内、必须为真实目录（非符号链接）的检查。
- 主规格 `preview-environment-reuse` 的"停止与彻底清理"条款同步：符号链接（含宿主缓存声明与断链）按链接条目删除，MUST NOT 跟随或改动链接目标；拒绝条件保留 owner 不匹配、停止未确认、目标不在预览根内或非真实目录。
- 集成测试将越界链接断言改为 purge 成功且链接目标完好，并补断链回归。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `preview-environment-reuse`: 修改"停止与彻底清理"的符号链接语义与拒绝条件。

## Impact

- 代码：`services/buildr/src/web/application/preview-lifecycle.ts`（assertPurgeTargetSafe）。
- 测试：`services/buildr/test/integration/preview-reuse-lifecycle.test.ts`。
- 规范：`openspec/specs/preview-environment-reuse/spec.md`（收敛时同步）。
- 技能源 `buildr-dev-preview` 未承诺越界链接拒绝，无需改动；错误码 `preview_purge_unsafe` 保留用于根身份违规。