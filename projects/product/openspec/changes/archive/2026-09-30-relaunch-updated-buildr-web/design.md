## Context

见 proposal.md - Why。关键现状事实：

- `buildInstallationStatusInventory`（`services/buildr/src/modules/installation/application/product-installation-status.ts`）对 `instances.released` 走 `inspectCurrentInstanceReadiness`：PID 存活 + 健康端点返回与 receipt 一致的 `productIdentity` 即 `ready`，从不与当前安装身份比较版本。
- DSH 插件 `observeBoundInstance`（`services/dsh-plugin/plugin/bridge.ts`）在 `ready` 时逐字段比对 `channel/ownershipIdentity/version/protocolIdentity/applicationPayloadDigest`，不一致即拒绝；`absent|stale|unreachable` 时走 launch；其余状态报实例校验失败。
- launcher handoff（`npmLauncherInstanceDisposition`，`services/buildr/src/web/infrastructure/instance-runtime.ts`）已能识别同槽位旧版本：`installationSlotIdentity`（由 `packageRoot+prefix+originEnvelope` 计算，版本无关）相同且 `launcherOwnershipIdentity` 相同 → `handoff-launcher`。
- `product-installations.json` 保留每次安装的登记记录；`enrollProductInstallation` 仅在 `ownershipIdentity+envelopePath+productRoot+entryPath` 全匹配时覆盖同条记录，因此历史版本条目保留（本机已有 rc.35/rc.37/rc.38 三条）。
- `defaultNpmLauncherTarget`（darwin）返回 `~/Applications/Buildr Web.app`；`npmLauncherStatus` 默认同样只查该路径；插件 `launcherRoots` 已同时登记 `~/Applications` 与 `/Applications` 两个候选，插件无需改代码。

**Goals:**

- 入口无需改代码即可恢复：`stale` 语义复用插件既有 launch 分支，launcher handoff 复用 `handoff-launcher` 既有语义。
- 不改 `buildr.installation-status/v1` 的 schema 与取值集合；`stale` 已是合法值，只收紧"何时算 stale"。
- macOS 默认安装目标迁移到 `/Applications`，遗留 `~/Applications` 安装如实可查、可修复、可卸载。

**Non-Goals:**

- 不在 `buildr update` 内直接终止实例（自我终止/会话中断问题交给入口时机解决）。
- 不修改 DSH 插件代码与发布物。
- 不为 development 渠道引入版本 stale 语义。

## Decisions

### 1. 在状态分类层修复，而不是让插件放行身份不匹配

在 `inspectCurrentInstanceReadiness`/`annotateInstanceProfile` 之后增加同槽位旧版本判定，对 `instances.released`（及 `currentInstance`）把"健康但版本落后且可证明同槽位"降级为 `stale` + 明确 reason。

同槽位证据按两条来源取：

- 实例有 `launcherIdentity`（Launcher 启动）：`installationSlotIdentity` 与当前 launcher binding 计算值相同。
- 实例无 `launcherIdentity`（CLI 启动）：`productIdentity.installationIdentity`（origin ownership）与登记注册表中同 `entryPath`/`productRoot` 的某条历史记录相等。npm 同槽位升级的每条历史 origin 都留在 registry 中；无法匹配即外来。

备选：让插件放行后再交给 launcher——会让"外来实例"也走到 launcher，把入口安全判断推给第二层，且要求插件改代码和重发包；放弃。备选：update 时直接停实例——自我终止问题（见风险）。

**兼容性**：`stale` 原语义是"PID 已死"；扩展为"登记的实例不再可直接服务"（死进程或旧版本存活进程）。插件对两者处理一致：launch → handoff 内 `healthyInstance` 判活，活实例走 `handoff-launcher`，死实例 receipt 被清后新启。语义变化对消费方单调宽松。

### 2. macOS 默认目标切到 `/Applications`，读取侧双候选

- `install`：默认目标 `/Applications/Buildr Web.app`。`fs.mkdirSync(dirname)`/写 bundle 抛 `EACCES` 时把错误升级为可解释诊断（含 `--target` 指引），不回退 `~/Applications`——静默回退会让同一台机器出现两个入口且用户不可预期。
- `status`/`repair`/`uninstall`/npm refresh：未给 `--target` 时按 `/Applications` → `~/Applications` 顺序探测已存在的 `.app`；命中哪个用哪个，结果里如实呈现 `target`。保证已装旧位置的用户不丢管理入口。
- `install` 默认目标成功写完后，若 `~/Applications` 存在同一 `installationSlotIdentity`/`launcherOwnershipIdentity` 的旧 Launcher，原子删除它；外来 ownership（证明不了同槽位）保留并报告。

备选：`install` 直接默认迁移旧位置——迁移是删除副作用，放 install 成功路径尾部、同 ownership 前提下执行，与 repair/uninstall 的 fail-closed 规则一致。

### 3. Agent 指引落在两处

- `cli-update.ts` 的 `updateBuildr`：成功后读一次 `instances.released`/`currentInstance` 状态，`stale`（同槽位旧版本）时把"重启 Launcher 完成实例切换"写入 `nextActions`；否则维持现有提示。
- `resources/runtime/skills/buildr/references/asset-maintenance.md` 更新一节：npm 更新后查 `buildr installation status --json`，released 实例 stale 时告知用户并经已安装 Launcher（`open` app 或提示用户点击）完成切换；Agent 自己跑在旧实例内或没有 Launcher 时只如实说明，不强杀。

## Risks / Trade-offs

- [分类误判把外来实例标 stale，诱导 handoff 杀错进程] → 只有 slot identity（launcher）或注册表历史 origin（CLI）可证明同槽位才降级；证明不了保持原 ready+身份事实，插件/消费方照旧拒绝。
- [`~/Applications` 旧入口残留导致双入口] → install 成功后按同 ownership 清理；清理失败只报告，不影响新入口成立。
- [无 admin 权限用户 install 失败率上升] → 错误明确给出 `--target <path>` 指引；repair/status 仍可读旧位置，不强制迁移。
- [update 在运行中的实例内执行时 nextActions 指引重启会终止当前会话] → nextActions 只描述事实与入口指引，不自动执行；Skill 明确"运行于该实例内部时告知用户手动重启"。
- [插件轮询窗口内旧实例才完成交接] → handoff 有有界等待与 receipt 校验（`launcher_handoff_*`），插件按 ready 重新查询，最坏表现为一次超时重试，不产生错误页面。

## Migration Plan

- 无数据迁移；`instance.json` 与 registry schema 不变。
- 已装 `~/Applications` 的用户：status/repair/uninstall 立即可用；执行一次 `launcher install`（或下次 npm 更新 refresh 路径外的显式 install）即迁移到 `/Applications`。
- 回滚：恢复旧分类与旧默认目标即可，无持久格式变化。
