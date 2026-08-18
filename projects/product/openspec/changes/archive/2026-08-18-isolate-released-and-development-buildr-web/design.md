## Context

当前 `localAppDataRoot()` 同时承担 Workspace registry、普通 Web instance/lock、product installation registry、release awareness、Launcher 状态与 Preview 基准目录。普通 `buildr web` 在注册 `--target` 后读取同一个 `instance.json`；只要协议一致就会复用健康实例，不区分 `productIdentity.channel`。因此 npm/released 与 development 虽已有正式 installation origin、runtime role 和不同 Launcher identity，运行状态仍汇入同一个 Root。

Workspace SQLite 位于 Workspace 自身。仅把 development instance/registry 移到新目录只能避免自动发现，无法阻止用户、CLI 或 API 再次把同一路径登记到另一 channel。保护必须位于 Workspace registry Application 与 Structured Store central open 之前，且不能依赖 UI、进程名、Launcher 文件名或 Data Root 名字猜测身份。

当前正式身份 authority 已存在：npm origin 使用 `channel=npm + runtimeRole=host`，checkout origin 使用 `channel=development + runtimeRole=development`。Preview 也已通过显式 `BUILDR_APP_DATA_DIR` 和 `BUILDR_LOCAL_APP_PREVIEW` 使用独立实例命名空间。

## Goals / Non-Goals

**Goals:**

- 让 npm/released 与 development 的普通 Web 使用不同默认 Data Root、instance、start lock 和 Workspace registry，并在随机端口上同时健康运行。
- 保留 npm/released 现有 Root 和用户 registry；development 首次切换为空 registry，不复制发布版条目。
- 在 Workspace SQLite 文件被创建、打开或 migration 前阻止跨 channel 双重管理，并提供路径、双方身份和恢复动作。
- 让 Development Launcher 自动进入 development profile，并让 Launcher、CLI、instance health 与 Doctor 对身份和 Root 的观察一致。
- 保持 product installation/release facts 的跨 channel 可见性、显式 Web Root override、Preview 生命周期和现有 loopback/session/Origin 安全不变量。

**Non-Goals:**

- 不降级、改写或迁移任何现有 Workspace SQLite，不修改集鲜 Workspace。
- 不把 GA/RC track 当作 Web channel；GA 与 RC 都属于 npm/released profile。
- 不提供 force/adopt 参数，不在两个 registry 间自动复制、移动或合并 Workspace。
- 不用 Git common directory 把不同 worktree 判为同一个真实 Workspace；Task Preview 继续由自己的 Environment/preview ownership 管理。
- 不引入第二业务数据库、远程服务、固定端口或桌面 WebView。

## Decisions

### 1. 拆分全局 Product Data Root 与 channel-scoped Web Data Root

新增 infrastructure-level Root resolver，输入 closed product identity，而不是可执行路径或目录名：

- `npm + host` → `released` Web profile。
- `development + development` → `development` Web profile。
- 其他组合或 `unknown` → 普通 Web 启动 fail closed。

平台默认值：

| 平台 | released | development |
|---|---|---|
| macOS | `~/Library/Application Support/Buildr` | `~/Library/Application Support/Buildr Dev` |
| Windows | `%LOCALAPPDATA%\\Buildr` | `%LOCALAPPDATA%\\Buildr Dev` |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/buildr` | `${XDG_STATE_HOME:-~/.local/state}/buildr-dev` |

显式 `BUILDR_APP_DATA_DIR` 只覆盖当前调用的 Web/Preview state Root，优先级高于 profile 默认值。普通 instance、start lock 与 Workspace registry 全部从同一个已解析 Web Root 派生，避免出现“instance 已隔离但 registry 未隔离”的半状态。

Product installation registry、installation origin enrollment、release awareness 最小状态和跨 channel Doctor inventory 继续使用共享 Product Data Root；它们不随当前 Web profile 切换。测试通过显式依赖注入或测试专用 Product Root 隔离，不再借普通 Web override 隐式改变正式安装 inventory。

不选择“让 `localAppDataRoot()` 根据 channel 改变所有调用方”，因为这会让 development Doctor 看不到 npm installation，并会无意移动 release/Launcher/Preview 状态。

### 2. instance receipt 明确保存 Web profile，并只在同 profile 内复用

普通 instance receipt 增加 closed Web profile identity（channel、runtime role、resolved Root identity）。read/health/reuse/start-lock/clear 都显式绑定同一 Root；健康协议相同但 profile 不同也不得复用。

旧 v1 receipt 只在其所在 released Root 与 health 返回的 product identity 可证明为 npm/released 时兼容复用。若 released Root 中仍有健康 development 旧实例，任何新 channel 都不覆盖或清理该 receipt，而是报告一次性退出旧实例并重新启动的诊断；进程停止后才能按 stale state 精确清理。这样避免为了迁移本机状态而误停不属于当前 profile 的服务。

退出只以当前 instance secret、URL、PID/profile 和 receipt 文件身份清理自己的记录。两个 Server 的随机端口、PID、secret、session 和 shutdown 独立。

### 3. 使用“对侧 registry + Workspace-local 最小管理记录”做双层 fencing

只交叉读取两个 registry 不足以覆盖显式 override、registry 丢失或已登记后文件损坏；只写 Workspace-local 标记又无法识别已有发布版 registry。第一版组合两者：

1. 当前 profile 由正式 product identity 得出。
2. 路径先 `path.resolve`，存在时再 `realpath`；读取 Workspace manifest identity。比较以 canonical real path 和 Workspace UUID 任一相同为冲突。symlink 指向同一目录会收敛；不同 Git worktree 不因共享 git-common-dir 自动合并。
3. 在 `.buildr/local/web-management.json` 保存 closed、最小、单 owner 管理记录：Workspace UUID、canonical real root、channel/runtime role 和不含 secret 的 profile identity。该文件是本机 protection state，不进入 Git、Task 或 SQLite。
4. 注册 Workspace 或第一次合法 structured-store mutation 时，在 Workspace-local management lock 内依次检查现有管理记录、released/development 对侧 registry 和当前 registry。任何对侧同 real root/Workspace UUID、未知 owner、损坏但存在的对侧 registry 或 identity 不一致都 fail closed。
5. 只有所有检查通过，当前 channel 才能原子建立/确认管理记录；随后完成当前 registry mutation。若 registry CAS 失败，本次新建 claim 只在内容仍精确匹配时回收。
6. 所有 Structured Store central open 在 `new DatabaseSync(...)` 之前调用同一 guard。只读操作不在无 owner 时静默 claim，但若对侧 registry/owner 已存在则同样阻断；写操作必须先取得 matching claim。

普通 Web list 可以展示当前 registry 中的冲突/损坏条目，remove API 仍可在不打开 SQLite 的情况下移除错误 channel 条目。只有当前 channel 已无该 Workspace 登记、对侧状态可判定且 management record 仍精确属于当前 channel 时，才清除本 channel claim；不删除 Workspace SQLite 或任何业务资产。

不选择把 owner 写入 Workspace SQLite，因为检查必须先于 SQLite open/migration；不选择共享单一 registry，因为产品要求两套 registry 独立且 development 首启为空；不选择 Data Root 名称推断，因为显式 override 和平台路径会使该推断不可靠。

### 4. Preview 保持独立 namespace，不成为第三个普通 channel

`web preview` 继续从其 preview owner/Environment 生成独立 `BUILDR_APP_DATA_DIR=<preview-root>`，使用独立 registry、instance 和 lock。普通 channel Root resolver识别 preview identity后保留现有 preview path，不把 Preview registry 交叉并入 released/development registry，也不让普通退出清理 Preview。

Preview 的 Workspace root 通常是 Task Environment worktree；它仍由既有 Task Environment resource ownership、owner file 和 secret 控制。正式双 channel fence只约束 ordinary npm/development management，不把 preview owner降格为 product channel，也不改变 `web preview start/list/stop` 契约。

### 5. Launcher 绑定产品身份，不通过用户手工环境变量选 Root

Development Launcher 继续是绑定 checkout、精确 Development Node 和 launcher identity 的薄 wrapper。Server 从 `readCliIdentity()` 得到 `development + development`，自动选择 Development Root；wrapper无需硬编码 macOS路径或要求用户设置 `BUILDR_APP_DATA_DIR`。

Launcher 启动时增加 closed identity一致性检查：development Launcher 必须匹配 development product identity，npm binding 必须匹配 npm/host identity；channel/runtime role、protocol 或 installation ownership 不一致时在启动 Web 前失败。`npm run install:development` 的 stop/restart/status 只观察 development Root 中的 owned instance，幂等重装不触碰 released Root、npm Launcher 或 released registry。

### 6. Doctor 同时观察两种安装和两套普通实例

Doctor 的 installation inventory仍来自共享 product installation registry。instance observation 改为按 `released`、`development` 两个默认 Web profile读取各自 receipt，分别报告 status、Data Root、PID、URL、channel/runtime role和identity；当前调用方 profile单独标记，但不把另一实例合并为 current。

Doctor 同步报告 Workspace management conflict时只读取管理记录和 registry identity，不通过打开 SQLite 来证明冲突。instance health仍遵守不泄露 secret的现有边界。

## Risks / Trade-offs

- [旧 released Root 中可能仍运行 development v1 instance] → 不覆盖、不跨 channel stop；给出退出旧实例后分别重启的明确诊断，并测试 stale cleanup。
- [registry mutation 与 Workspace-local claim 跨两个文件，无法形成单文件原子事务] → 用 Workspace-local lock串行化检查和claim；CAS失败只精确回收本次新 claim，任何不确定状态保留并 fail closed。
- [Workspace-local management record损坏会阻止 CLI] → 诊断展示文件、Workspace、当前/冲突身份和“从错误 registry 移除或使用隔离副本”；第一版不自动修复或 force。
- [复制 Workspace 会复制本机 `.buildr/local` 状态] → 使用隔离副本时必须获得新的 canonical Workspace identity或清理由正确 owner完成；盲目复制不能成为绕过fence的方法。
- [其他平台无法执行真实 Launcher smoke] → macOS在临时install root执行真实 development Launcher wrapper smoke，不修改用户Launcher；Windows/Linux覆盖纯路径、identity、wrapper内容和生命周期逻辑，未运行平台列为交付缺口。
- [Structured Store central guard扩大到非 Web CLI] → 这是刻意的安全边界，可防止 development CLI直接迁移 released Workspace；只读且未被任何channel管理的Workspace仍可诊断，写入前才建立claim。

## Migration Plan

1. 发布版继续读取现有 `Buildr` Root，不移动 registry、instance 或安装事实。
2. 新 development runtime默认读取空的 `Buildr Dev` Root；`npm run install:development` 不复制旧 registry。
3. 已有 Workspace 第一次被当前 channel注册或发生合法 Structured Store mutation时建立最小 management record；若对侧旧 registry已登记同路径/UUID，则在写 SQLite 前失败。
4. 旧 shared-root development instance若仍健康，用户先通过其公开退出动作停止；之后 released 与 development各自在自己的Root按需启动。
5. 回滚代码不会移动任何 Root，但新 management record会保留保护事实；旧 runtime不认识该记录。发生回滚时不得用旧 development runtime打开已由新版本写入的 Workspace SQLite。

## Open Questions

无；第一版不提供自动转移 ownership。任何 channel 迁移都通过先从错误 registry移除、确认旧实例退出，再由目标 channel显式登记完成。
