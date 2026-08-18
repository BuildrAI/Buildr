## Why

发布版 `Buildr Web` 与 checkout-backed `Buildr Web Dev` 当前共享同一个 Application Data Root、单实例文件和 Workspace registry，development runtime 因而可以复用发布版实例并打开正式业务 Workspace。真实事故已经导致 development migration 升级集鲜 Workspace SQLite，使较旧发布版随后以 `workspace_store_database_newer_than_runtime` 失败；产品必须在 SQLite 打开和 migration 之前把 npm/released 与 development 的管理边界变成 fail-closed 契约。

## What Changes

- 由正式 product installation channel/runtime role 解析普通 Buildr Web 的 channel profile；显式 `BUILDR_APP_DATA_DIR` 继续拥有最高优先级。
- npm/released 保持现有默认 Data Root，development 使用平台对应的独立默认 Root；两者分别拥有普通 Web instance、启动锁和 Workspace registry，并可同时运行、独立退出。
- 在 CLI `buildr web --target`、Launcher 和 Workspace 注册 API 的共同 Application 边界增加 Workspace 管理身份检查；通过 canonical real path、Workspace identity、对侧 registry 和 Workspace-local 最小管理记录识别冲突，并在任何 Workspace SQLite 打开或 migration 前失败关闭。
- Development Launcher 自动携带并验证 development 身份，不要求用户手工设置 Data Root；重复安装不复制发布版 registry，也不覆盖 npm Launcher 或发布版 instance。
- 将全局产品安装事实与 channel-scoped Web 运行状态明确拆分；product installation registry、release awareness 与安装诊断保持共享可见，Preview 继续使用自己的隔离命名空间。
- Doctor/status 分别投影 npm/released 与 development 的安装、Data Root 和当前实例，不把另一 channel 的实例误报为 current。
- 发布版默认 Root 和 registry 保持原位；development 首次切换为空 registry，不复制、移动、删除或重写任何发布版数据。

## Capabilities

### New Capabilities

- `buildr-web-channel-isolation`: 定义普通 Buildr Web 的 channel profile、Data Root、并行实例、registry 隔离与 migration 前 Workspace 双重管理保护。

### Modified Capabilities

- `local-workspace-application`: 将“全局单实例”收敛为每个正式 Web channel 单实例，并补充 Development Launcher、registry 与退出生命周期的隔离语义。
- `agent-readable-doctor`: 从单个 current instance 投影扩展为按 npm/released 与 development channel 分别观察安装、Data Root 和实例身份。

## Impact

- 主要实现：`workspace-registry-repository.mjs`、`instance-manager.mjs`、`server.mjs`、Workspace Application、product identity/data-root abstraction、Doctor installation projection。
- Launcher：development launcher build/manage/install 脚本及 npm Launcher identity 校验；正式 npm Launcher 默认行为保持兼容。
- 测试：Data Root 解析、双实例/双 registry、双重登记与 SQLite 零变化、Launcher 幂等、Doctor 双实例、Preview 回归和 macOS Launcher smoke。
- 本机兼容性：不修改集鲜 Workspace，不安装正式版本，不移动现有 `Buildr` Data Root；新的 `Buildr Dev` Root 只承载 development 普通 Web 状态。
