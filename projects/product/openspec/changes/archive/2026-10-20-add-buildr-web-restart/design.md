## Context

「退出」链路已完整：页面对话确认后调用 `POST /api/v1/app/quit`，HTTP 层校验 Origin/会话令牌并经关闭优先（closing precedence）判断后调用一次 shutdown 端口（`web/http/router.ts`、`web/http/server.ts`）。进程交接也已存在：npm 更新使用 `--update-handoff` 让新进程在启动锁内请旧实例 `quit-instance` 认证退出并绑定原端口（`web/application/instance-lifecycle.ts`、`web/application/update-web-handoff.ts`），实例密钥认证由 `web/infrastructure/instance-runtime.ts` 提供。前端会话适配器 `LocalSessionAdapter.refreshSession()` 已会重新抓取当前页并从 meta 读取新的会话令牌（session token）。

约束：重启要覆盖 released 与 development 渠道，`--update-handoff` 被明确限定 npm 渠道且同身份命中复用分支，不能直接复用；Preview 实例由独立 owner/pid/secret 管理，第一版不提供入口；会话令牌与实例密钥（instance secret）都只能出现在各自已认证通道，不能为「页面探测新实例」新增无认证公开状态端点（本变更不新增）。

## Goals / Non-Goals

**Goals:**

- 用户在顶栏一键触发本机服务重启，原访问端口被同身份新实例接管，页面自动恢复到可操作状态。
- 接管全程复用既有启动锁、实例回执、认证退出与健康核对；失败保留现场，不产生双实例。
- Preview 实例明确拒绝重启请求且不提供入口。

**Non-Goals:**

- 不公开 `buildr web restart` CLI 命令；`--restart` 是进程间内部参数。
- 不重启 Preview 实例，不改变其独立生命周期。
- 不改变 `quit`/`quit-instance`/`--update-handoff` 的既有语义。
- 不新增公开状态端点；页面只通过会话令牌变化判断新实例就绪。
- 跨版本页面兼容不做专门处理：旧版实例无 restart 端点，新版页面对其调用按普通错误展示。

## Decisions

### D1：重启语义 = 同身份交接，不走「旧进程自我接替」

由当前实例响应 restart 请求后 spawn 后继进程，后继进程以新参数 `--restart <实例观察摘要>` 走与 `--update-handoff` 相同的接管路径：启动锁 → 核对回执与健康 → `quit-instance` 认证退出旧实例 → 绑定原端口 → 写新回执。

理由：退出动作后旧进程没有权威确认新实例就绪；让新进程反向发起认证退出，失败时旧实例继续存活、现场保留，与更新交接的失败语义一致。另一个方案「旧进程响应前先在自身内 spawn 并等待」会在 shutdown 后失去响应通道，反而更难表达失败。

### D2：`--restart` 与 `--update-handoff` 分离而非复用参数

`--update-handoff` 同时携带「npm 渠道断言」「同身份直接复用」「安装归属核验」三层更新语义；同身份重启恰恰需要绕过前两项。新增 `--restart <观察摘要>` 复用同一接管骨架但去掉 npm 专属断言：

- `assertCompatibleInstance` 既有检查（web profile 一致性、协议身份、development 来源一致性 `developmentInstanceMatchesInstallation`）继续生效，负责挡住「误接管别的实例」。
- 同身份接管只要求 `buildrWebInstanceObservationDigest` 匹配已观察实例；实例在交接期间被替换时按既有 `web_update_instance_changed` 同型错误保留现场。
- 原端口沿用 update-handoff 的首选端口 + 随机回退策略；回退发生时如实输出实际地址。

实现上把 instance-lifecycle 中 `--update-handoff` 分支的观察/接管逻辑泛化为 `handoffMode: 'update' | 'restart'`，npm 专属断言只在 `update` 模式执行；`--restart` 同样禁止 `--target`、继承 `--no-open` 语义，且不进入帮助文本（内部参数）。

### D3：后继进程用 `currentProductInvocation` 启动

restart 端口使用 `runtime.currentProductInvocation({ cliPath: process.argv[1] })`（与 `preview-lifecycle.ts` 同一模式），`productInvocationArgs` 拼出 `web --restart <digest> --port <原端口> --no-open`，`spawn(detached, stdio: ignore)` 并 `unref()`。该入口对 npm 安装的 `bin/buildr.mjs` 与开发 checkout 的薄入口都能复原当前调用方式，不需要区分渠道。环境沿用 `updatedWebEnvironment` 同款清理：剔除 Launcher/安装身份/预览相关变量，避免后继进程继承旧实例的运行角色。

为可诊断性，后继进程沿用 update-handoff 的 IPC 诊断模式（`stdio: [ignore, ignore, ignore, ipc]`）：子进程启动失败经 `process.send` 回报 `buildr.web-update-handoff-failed` 同型消息；旧实例把「已接受接管」与「接管失败」区分记录到控制台日志，不影响已返回的 202。

### D4：HTTP 面新增 `local-app.restart`，生命周期端口承担全部编排

- 契约：`buildr-web-http-contracts.ts` 新增 `jsonOperation('local-app.restart', 'POST', '/api/v1/app/restart', 'restartRequest', 'restartingResponse')`；请求为闭合空对象，响应 `{status:'restarting'}` 与既有 `stopping` 同型。
- 路由：`router.ts` 新增与 `quit` 并列的分支：`assertWriteRequest` → `validateRequest` → `jsonResponse 202` → 调用 restart 端口。`closing` 期间与 quit 一样被 `app_shutting_down` 挡住；Preview 实例在端口层直接拒绝（不 spawn），返回稳定错误。
- server.ts 向 router 提供 `restart()` 端口（可选注入，默认按 D3 spawn 后继进程）；路由本身不编排锁与等待——编排全部在 instance-lifecycle 的启动路径，与 update-handoff 保持一致的分层。

### D5：页面恢复只凭会话令牌变化，不新增端点

重启后主按钮进入「正在重启」全屏态（复用 `exit-screen` 同级结构）：以 `cache: 'no-store'` 周期抓取当前页 HTML，解析 `meta[name="buildr-session"]`；令牌与重启前不同即视为新实例就绪，`location.reload()` 整页刷新（同时拿到新令牌与新 `web-dist` 资产，无需依赖 `refreshSession` 的局部刷新）。约定时间内（设计值：30 次 × 1s，超时后进入可重试态）未确认变化则呈现重试与「重新打开 Buildr Web」指引——回退端口接管是唯一会让本页失联的情形，提示如实说明服务可能已在新地址运行。

### D6：顶栏拆分按钮

Ant Design `Dropdown.Button` `type="text"`：主按钮「重启」（`id=restart-buildr`，`nav-quit` 同款样式，确认框注明「进行中的生成与任务验证会被取消」），下拉菜单项「退出 Buildr Web」（`id=quit-buildr`）。`previewIdentity` 存在时整体回退为仅「退出」文本按钮，保证验收契约稳定。既有按 `#quit-buildr` 直接点击的浏览器检查改为先展开下拉，属验收契约内的稳定 id 迁移。

## Risks / Trade-offs

- [旧实例 `server.close()` 因保活连接迟迟不退出] → 与更新交接同源风险；`waitForExit` 预算用尽即失败并保留现场，不重试接管。页面侧超时提示重新打开。
- [原端口被系统内其他进程抢占导致回退] → 如实输出新地址；页面超时态提示「服务可能已在新地址运行」，不冒称恢复（spec 已约束诚实报告）。
- [后继进程启动失败（spawn error/参数拒绝）] → IPC 诊断回报，旧实例继续运行；页面收到 202 后轮询超时进入重试态，不产生「服务消失」中间态。
- [浏览器多标签并发重启] → 第二路 restart 请求在 closing 后被 `app_shutting_down` 拒绝；新实例就绪后各标签独立轮询刷新，无需去重。
- [重启打断进行中的生成与验证] → 确认框明示；清理语义与退出完全一致（DSH 释放自身连接、Codex 专用实例关闭、owned process group 清理）。
- [开发 checkout 后继进程加载的是 worktree 旧代码] → 符合预期：重启加载的是「启动该实例的同一入口」的当前代码；用户要换新构建时构建产物已就位，语义诚实。

## Migration Plan

功能为新增，无数据迁移。旧版实例无 restart 端点：新版页面 + 旧版实例的组合只出现在更新交接完成的同一版本内；若运行中的旧版页面（无重启按钮）之外被新版 web-dist 刷新，rest 请求未定义端点返回稳定 `not_found`，页面按普通错误呈现。`--restart` 参数不进入帮助与公开契约，后续如公开 `buildr web restart` 再走新变更。

## Open Questions

- 无。
