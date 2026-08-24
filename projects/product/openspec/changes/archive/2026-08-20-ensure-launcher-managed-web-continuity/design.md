## Context

`buildr web` 与正式 `Buildr Web` Launcher 共用 released Web profile、实例记录和单实例启动锁。当前 Runtime 只要发现同 profile、protocol 兼容的健康实例就立即复用；当本次调用携带 Launcher binding、而健康实例由普通 CLI 启动且 `launcherIdentity` 为空时，这个判断仍成立。macOS launchd runner 因 `web` 命令返回而退出，前台 CLI 进程继续成为唯一服务 owner，导致图形启动没有获得预期的后台连续性。

现有 v2 实例记录已经包含 `launcherIdentity` 和 `productIdentity`，可以表达本次启动来源与安装身份；不需要新增持久 schema。现有 `/api/v1/app/quit-instance` 使用实例 secret 提供本机认证的优雅停止入口，profile-scoped `instance-start.lock` 可以作为交接串行化边界。

## Goals / Non-Goals

**Goals:**

- Launcher 只复用由同一 binding 精确启动的健康实例。
- Launcher 可以把同一 npm installation 的前台 CLI 实例安全交接为 Launcher 托管实例。
- 并发点击、旧 binding、异常记录和停止失败均保持单实例与 ownership fail-closed。
- Launcher 成功返回前验证新实例健康且携带当前 binding identity。
- `SIGHUP`、`SIGINT`、`SIGTERM` 与公开退出动作使用一致的实例记录清理语义。

**Non-Goals:**

- 不把普通 `buildr web` 改成后台 daemon，也不改变其前台生命周期。
- 不引入常驻 LaunchAgent、自动崩溃重启或第二套 supervisor/update authority。
- 不修改 Launcher binding、实例记录或公开 HTTP API schema。
- 不跨 released/development profile 接管、停止或迁移实例。

## Decisions

### 1. 将运行兼容性与连续性所有权分开

普通 CLI 调用仍可复用同 profile 的兼容健康实例。Launcher 调用则额外要求健康实例的 `launcherIdentity.bindingIdentity` 与当前 binding 精确一致，只有满足该条件才直接复用。

选择复用现有 `launcherIdentity`，而不是新增 `launchMode` 或实例 schema，是因为它已经由健康接口和实例记录共同证明启动来源，并且 npm binding 自带 installation slot、ownership 与 payload identity。新增平行字段会制造可能漂移的第二份所有权事实。

### 2. 只接管可证明属于当前安装边界的实例

Launcher handoff 分为三类：

- `launcherIdentity` 为空时，只有实例 `productIdentity` 与当前 binding 的 npm installation、payload、protocol 和 released profile 匹配，才允许接管。
- 实例由旧 binding 启动时，只有 installation slot 与 Launcher ownership 连续，才允许受控替换。
- foreign、跨 profile、身份缺失或无法验证的实例保持运行并返回明确冲突，不尝试停止或覆盖。

这比“同 channel 即可接管”更严格，避免共享 Data Root 或兼容 protocol 下误停另一份 npm installation。

### 3. 在现有 profile start lock 内完成有界交接

需要 handoff 时先取得 `instance-start.lock`，随后重新读取并认证当前实例。锁内状态可能已经被另一 Launcher 调用推进：若已出现当前 binding 实例则直接复用；若仍是可接管实例，则调用认证的 `quit-instance`、等待旧 health/receipt 退出，再按 binding 的端口策略启动新实例。

未取得锁的并发调用等待“当前 binding 的健康实例”，不得把仍存活的旧 CLI 实例当成成功结果。停止或等待超时保持旧现场并失败关闭，不使用 `SIGKILL`，也不启动第二个 writer。

选择复用现有 start lock，而不是新增 handoff lock，是因为启动和 ownership 转换必须属于同一个 profile 单实例临界区；两个锁会引入顺序与恢复歧义。

### 4. 启动成功以新健康身份为准

handoff 后沿用现有 binding `webPort` 策略，不承诺保留普通 CLI 的随机端口。Launcher 在新实例写入 receipt 并通过 health 返回当前 binding identity 后才打开浏览器和报告成功。这样用户看到的 URL 与后台 owner 属于同一已验证启动。

### 5. 信号清理是卫生修复，不替代 handoff

为非 Windows Runtime 增加 `SIGHUP` 优雅关闭，并让 server close 时移除本次注册的 signal/exit listener，避免测试或同进程重启累积 handler。该改动减少终端退出后的陈旧 receipt，但普通 CLI 仍会随其终端生命周期结束；连续性保证只来自 Launcher handoff。

## Risks / Trade-offs

- [handoff 会改变 URL/端口] → 使用 binding 的既有端口策略，并只在新实例 ready 后打开新页面；不承诺维持 CLI 随机端口。
- [长连接或未完成请求拖延 `server.close`] → 使用有界等待；超时失败关闭并保留现场，不强杀。
- [并发 Launcher 调用观察到旧实例] → 锁竞争方等待精确 matching binding，而不是等待任意健康实例。
- [旧版本实例身份字段不完整] → 不推断 ownership；返回可诊断冲突，让用户通过公开退出动作处理。
- [增加 `SIGHUP` handler 改变默认信号退出码] → handler 只完成与 `SIGTERM` 相同的同步 receipt 清理和 server close，测试明确验证退出与清理结果。

## Migration Plan

无需数据迁移。新版本首次由 Launcher 启动时即时判断当前实例；匹配实例继续复用，可证明的 CLI/旧 binding 实例进行一次优雅交接，其他实例保持原状并提示冲突。回滚到旧版本不会读取新字段，因为本变更不修改持久 schema。

## Open Questions

无。
