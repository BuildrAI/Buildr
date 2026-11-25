# Design: dsh-sidebar-order-and-dual-restart

## 1. DSH 侧边栏排序区间选择
- 已核对本机 `/Applications/DeepSeek Harness.app`（`0.2.2-rc.5`）插件清单：`dsh-client-ui-plugin-manager`（`插件`）使用 `order: 0`，`dsh-client-ui-schedule`（`自动化任务`）使用 `order: 10`，`dsh-client-ui-sidebar` 按 `a.order - b.order` 升序排列。
- 设定：
  - `Buildr Harness`：`released ? 4 : 5`
  - `Buildr Development`：`released ? 6 : 7`
- 该设计保证：
  - 正式版（`4`, `6`）与开发版（`5`, `7`）均满足 `0 < harness < development < 10`，紧跟在 `插件` 下方且排在 `自动化任务` 之前。
  - 若未来正式版与开发版偶然同时存在，排序仍各自唯一、相邻且顺序稳定（`4 < 5 < 6 < 7`）。

## 2. 自举脚本多插件四阶段单次重启状态机
将 `skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs` 从逐插件循环改为四阶段事务式流程：
1. **Stage 1（准备与预检）**：遍历命中的插件，校验 DSH profile、`dsh --version`、`matches(initial.archive, initial.installedDir)`、执行 `build-dev.ts`、生成内容寻址的 `.tgz` 归档，并区分 `skipped`、`unchanged`（非旧包名且已与最新归档字节一致）、`pendingInstall`；任一插件出现校验/构建错误即清理临时目录并返回 `blocked`，不触碰 DSH 进程。
2. **Stage 2（单次退出控制）**：若 `pendingInstall` 非空且 DSH 仍在运行：
   - 未指定 `restartDsh` 时直接将全部 `pendingInstall` 标记为 `pending`；
   - 指定 `restartDsh` 时，查找宿主连续性锚点（优先本次待更新列表中的 `supportsContinuity` 插件，否则检查桌面 profile 是否已绑定本地可核验的 `supportsContinuity` 插件），校验全部受影响插件仍维持初始绑定，调用 `continuityController.quit(anchorInitialDigest, allOriginalUnchanged)` 退出 DSH 一次，并二次确认进程退出与配置未漂移。若未绑定支持连续性的宿主锚点或未能确认退出，则安全返回 `pending`，不强杀。
3. **Stage 3（退出态顺序迁移与安装）**：在 DSH 已退出前提下，逐个插件复核自身仍匹配初始绑定（仅检查当前插件在 `package.json` 的依赖项、tar 包和 `node_modules` 文件，不要求整份 `package.json` 摘要在上一插件写入后保持不变）；若为旧包名则先执行 `dsh plugin remove` 并清理 `dsh.profile.bundles` 中遗留条目，再执行 `dsh plugin add --ignore-scripts <archive>` 并回读验证。任一步骤发生未带信号/错误码的确定失败且其余初始状态可恢复时，仅按初始摘要尝试重开原 DSH 并返回 `blocked`。
4. **Stage 4（单次重开与返回汇总）**：当本次流程曾验证退出 DSH 时：
   - 仅当所有 `pendingInstall` 均明确安装成功（无 `signal` 或 `errorCode`）时，调用一次 `continuityController.reopen(verified, anchorCurrentDigest)`，汇总各插件状态并返回整体 `desktop: 'reopened'` 与 `desktopLoaded`。
   - 若存在任意 `signal || errorCode` 导致安装结果未明，则保留 `desktop: 'install-result-unconfirmed'` / `'exited'` 且不盲目重开。
- 返回结构保持完全向后兼容：单插件激活时解包顶层字段，多插件激活时返回汇总字段及 `plugins` 明细数组。
