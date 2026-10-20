## Context

现状链路与关键约束：

- Buildr 主体在 `web/application/instance-lifecycle.ts` 的 `assertCompatibleInstance` 中对 development profile 做来源匹配（`developmentInstanceMatchesInstallation`），不匹配抛 `web_instance_development_source_conflict`(409)，保留旧实例。
- 旧实例的优雅替换路径已存在：启动锁内 `shutdownInstance`（带 secret 的 `POST /api/v1/app/quit-instance`）+ `waitForExit`（比对 secret/url 轮询 receipt 移除）+ 原端口 fallback + health 身份复核，当前服务 npm Launcher handoff 与 `--update-handoff`。
- 插件 `plugin/bridge.ts` 每次打开先查 `installation status`；`observeBoundInstance` 对 development 只看 `instance.matchesCurrentInstallation === true`，不匹配抛 `instance-mismatch` 终止本次打开。
- 插件 `launch` 走系统 Launcher app（`Buildr Web Dev.app`），无法传入新 flag；但 `channelCommand()` 可从公开的 development 安装身份解析出注册的 `buildr` 入口，正如此前 `source-process.ts` 的做法。

## Goals / Non-Goals

**Goals:**
- 用户点「Buildr 开发版」入口：来源不匹配的旧实例被正常退出，新实例起来后直接打开，零额外步骤。
- 替换全程可证明：只退出「同一 development profile、来源不匹配、健康」的实例；恢复失败保留现场并有明确诊断。
- 不新增实例状态来源；替换复用既有锁、receipt、认证退出与等待。

**Non-Goals:**
- 不放宽 `developmentInstanceMatchesInstallation`；不缩小运行输入范围。
- 不做空闲检测、后台守护或全自动静默替换（替换仍由用户打开动作触发）；不处理 npm 渠道（沿用 stale/handoff）。
- 不在卡上新增第二按钮、不改造 DSH 界面；恢复即打开。

## Decisions

### 1. 替换能力放 Buildr 生命周期，插件只发起请求

`startBuildrWeb` 新增显式 flag `--replace-mismatched-development`（仅 development profile；与 `--update-handoff`、`--launcher-binding` 互斥）。`assertCompatibleInstance` 拆成「兼容性检查」与「来源不匹配判定」：profile/protocol 校验不变；development 不匹配时由调用方决定抛 409 还是进入替换。

启动锁内替换直接复用现有 handoff 块：`shutdownInstance` → `waitForExit` → 原端口 fallback 启动 → 健康身份复核。锁内再次观察（`observeInstance(currentRecorded)`）保证两次查询之间实例变化仍被重新判定——来源已恢复匹配的实例正常复用不替换；被替换过的 receipt 由 `waitForExit` 的 secret/url 比对识别并保留现场。

替代方案「插件直接读 instance.json 的 secret 调 quit-instance」被否：实例生命周期属 Buildr 拥有，插件不应持有终止能力，也拿不到启动锁内的串行保证。

### 2. 插件侧恢复 = 打开动作的一次额外尝试

`bridge.ts` 的 `run()` 在 `observeBoundInstance` 抛 `instance-mismatch` 且 channel=development、提供了 `recover` 钩子时：调用 `recover()` 发起替换，然后进入既有轮询循环；轮询期间再次 `instance-mismatch` 视为替换进行中继续等待（受同一 timeout/deadline 限制），出现 ready 即返回。`recover` 自身失败把原 `instance-mismatch` 诊断改报为明确的恢复失败。

替代方案「先点一次诊断、再点一次恢复」被否：多一次用户往返而没有新增信息。

### 3. 插件恢复入口直接 spawn 注册 CLI，不走 Launcher app

`process.ts` 为 development 渠道提供 `recover`：用 `channelCommand()` 解析开发安装登记的 `buildr` 入口，`spawn(node, [wrapper, 'web', '--replace-mismatched-development', '--no-open'], {detached, stdio:'ignore', env: childEnvironment})` 并 `unref()`；实例就绪由桥的既有轮询确认，不监听子进程退出。与正式版 handoff 一样，子进程短暂存活即可把新 server 写进 receipt。

`--no-open` 避免旧进程位置再弹一个浏览器窗口；最终 URL 由 `observeBoundInstance` 返回给打开者。

### 4. 诊断与呈现

- `startBuildrWeb` 替换路径的日志明示「正在退出旧实例并重新启动」；失败错误码 `web_dev_replace_shutdown_timeout`/`web_dev_replace_receipt_replaced` 复用 codedError 409/500 语义，不含内部路径。
- `instance-lifecycle.ts` 中 `assertCompatibleInstance` 返回值细化为 `reuse | replace-development`，其余校验顺序与抛错不变。
- CLI help 补一行该 flag 的用途与适用范围（development 专属、需显式选择）。

## Risks / Trade-offs

- [点击即杀旧实例，旧实例可能开着工作现场] → 这是本能力的授权语义：打开动作是明确选择；恢复只对「来源已不匹配的 development 实例」生效，健康匹配实例仍复用；窗口中正在运行的任务/写入由优雅退出正常处理。
- [替换期间旧实例仍回答 health=ready 但不匹配] → 桥在 recover 后把继续 `instance-mismatch` 当进行中处理，受同一 30s deadline 限制；超时按现有 `timeout` 诊断返回，不会静默转圈。
- [并发打开/并发 starter 竞争] → 启动锁串行化替换；并发等待方仍走既有 `waitForInstance` 分支并重新断言兼容性。
- [recover spawn 后旧 Buildr 版本不认识新 flag] → 该场景要求本机登记的开发源码支持本能力；不支持时 web 启动失败，receipt 无新实例，桥超时后给明确诊断。
- [用户在弹卡后等了很久才再点] → 每次打开都重新查询当前状态，恢复决定基于当次 observation，不基于缓存。

## Migration Plan

1. `buildr`：lifecycle 增加 flag 与替换编排 + 单元/集成测试；CLI help 文案。
2. `dsh-plugin`：bridge 增加 recover 编排 + process.ts 的 development recover 实现；bridge 测试覆盖不匹配→恢复→就绪、恢复失败诊断、npm 不变。
3. 真实开发渠道验证：运行中的旧实例 + 当前源码变化后，插件 open 完成一次替换接入；`installation status` 的「开发来源匹配」恢复为匹配。
