# Tasks

## 1. installation status 同槽位旧版本分类

- [x] 1.1 在 `services/buildr/src/modules/installation/application/product-installation-status.ts` 增加实例版本分类：ready 的 released 实例与当前安装身份不一致时，用 `launcherIdentity.installationSlotIdentity`（Launcher 启动）或注册表同 `entryPath`/`productRoot` 的历史 origin `ownershipIdentity`（CLI 启动）判定同槽位 → `stale` + 明确 reason；无法证明则保留原 `ready` 身份事实。对 `instances.released` 与 `currentInstance` 生效；development 不改变。
- [x] 1.2 补测试覆盖：同槽位旧版本（launcher/CLI 两种来源）→ `stale`；外来实例（槽位不符、`profile-conflict`）→ 非 stale；健康且身份一致 → 仍 `ready`；PID 死亡 → 仍 `stale`（死进程）。验证 `services/buildr` 相关单测通过。

## 2. macOS Launcher 默认目标迁移到 /Applications

- [x] 2.1 修改 `defaultNpmLauncherTarget`（darwin）：`install` 默认 `/Applications/Buildr Web.app`；`status`/`repair`/`uninstall`/npm refresh 未给 `--target` 时按 `/Applications` → `~/Applications` 探测已存在目标。
- [x] 2.2 `install` 默认目标成功写入后，移除同 `installationSlotIdentity`/`launcherOwnershipIdentity` 的 `~/Applications` 旧入口；外来 ownership 保留并报告。权限不足（`EACCES`）时返回含 `--target` 指引的可解释错误，不写 `~/Applications`。
- [x] 2.3 更新 `interfaces/cli/launcher.ts` 帮助文本与 `npm-launcher` 相关测试：默认目标、旧位置读取、迁移清理、权限失败分支。

## 3. 更新结果与 Skill 指引

- [x] 3.1 `services/buildr/src/modules/installation/application/cli-update.ts`：`updateBuildr` 成功后若 released 实例为同槽位旧版本 `stale`，`nextActions` 增加经 Launcher 重启完成实例切换的指引；不自动终止实例。
- [x] 3.2 `services/buildr/resources/runtime/skills/buildr/references/asset-maintenance.md`：更新一节补充——`buildr update` 后查 `buildr installation status --json`，released `stale` 时告知用户旧版本仍在运行并经已安装 Launcher 完成切换；Agent 位于旧实例内或无 Launcher 时只说明需重启应用；不得自行强杀实例。

## 4. 核对与验证

- [x] 4.1 运行 `openspec validate relaunch-updated-buildr-web --strict` 与 `buildr openspec convergence preflight` 通过。
- [x] 4.2 按 `services/buildr` 受影响范围跑安装/launcher/状态相关测试（npm-launcher、installation status、cli-update 相关套件），并在 worktree 内核对 `verification.yml` 适用能力。
- [x] 4.3 知识影响复核（assess → reconcile）：`knowledge/docs/guides/getting-started.md` 更新后旧实例处理表述；`knowledge/docs/glossary.md` Launcher 条目安装位置；`knowledge/code-map/system-services-assets.md` 安装模块描述如失准则校准。
