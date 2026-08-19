## Context

正式 npm Launcher 目前生成 closed `buildr.npm-launcher-binding/v1`，但 binding 不保存 Web 端口策略；macOS wrapper 在完成 Node、entry 与 digest 校验后以前台方式执行 `buildr web --launcher-binding ...`，因此 Web 进程存活期间 `.app` 的 shell 进程也一直存活。LaunchServices 随后无法把这个无 GUI 激活入口作为可重开应用处理，第二次 `open` 返回 `-600`。Server 默认 `--port 0`，所以正式入口每次全新启动都由系统选择随机端口。

现有 channel isolation 已把 released 与 development 的 Data Root、instance receipt、start lock 和 registry 分离；端口策略必须继续由正式 npm binding 驱动，不能通过进程名、App 路径或 Data Root 猜身份。普通 CLI、Development Launcher 和 Preview 仍需要现有显式/随机端口行为。

## Goals / Non-Goals

**Goals:**

- 正式 npm Launcher 默认首选 `127.0.0.1:4457`，并允许安装或 repair 时指定其他首选端口或 `0` 随机端口。
- 非零首选端口无法绑定时只回退一次随机端口，仍由 matching released profile 的单实例、instance receipt 和 start lock 管理。
- macOS `.app` executable 完成同步 preflight 后快速退出；后台启动器负责运行正式 npm entry、追加日志并在失败时提示。
- 首次点击与重复点击都能启动或复用同一健康实例，且不影响 Development Launcher、Preview 或直接 `buildr web --port`。
- 支持从 v1 binding 安全 repair 到带端口策略的新 binding，并允许未发布的隔离 npm candidate 生成独立 Launcher 做真实验证。

**Non-Goals:**

- 不发布 npm package，不替换用户当前正式 Launcher，不改变 development profile 的动态端口。
- 不增加远程监听、端口扫描、无限重试、后台守护进程或第二份 instance authority。
- 不处理 Developer ID 签名、公证或开发版页面标识。

## Decisions

### 1. 端口策略进入 closed npm Launcher binding

新增 `buildr.npm-launcher-binding/v2`，在 binding material 中加入 closed `webPort`：

- `preferred`：`0..65535`；默认 `4457`，`0` 表示直接随机。
- `fallback`：固定为 `random`；仅在 `preferred > 0` 且首次 listen 失败原因为 `EADDRINUSE` 时使用。

`buildr web launcher install --port <port>` 创建策略；省略时使用 `4457`。`repair --port <port>` 显式替换策略，省略时保留已有 v2 策略；repair v1 时迁移为默认 `4457`。`status` 返回 binding 中的策略和实际 instance 观察，不从 wrapper 文本反向解析。

选择 binding 而不是 shell 参数，是因为 macOS 与 Windows 必须消费同一正式策略，repair/status 也需要可验证的持久身份。普通 `buildr web --port <port>` 不读取该策略，继续保持显式端口严格绑定和 `0` 随机语义。

v2 binding identity 覆盖 `webPort`。v1 只在 status/ownership/repair 路径兼容读取，以便证明同一 npm installation 和 target 后安全迁移；正式新启动只生成并消费 v2。

### 2. Server 在同一个 start lock 内执行一次有界回退

`startLocalWorkspaceApp` 先完成 profile、binding、健康实例和 start lock 校验。没有健康实例时，从 npm binding 得到端口策略：

1. 尝试 `preferred`；`0` 由 OS 直接分配。
2. 只有非零端口返回 `EADDRINUSE` 时，关闭未就绪 server 并在同一 start lock 内以 `0` 重试一次。
3. 其他错误或随机端口启动失败直接返回原始诊断，不扫描端口、不循环重试。
4. 只有成功 ready 后才写 instance receipt；日志明确记录首选端口冲突、回退和最终 URL。

已有 matching released 实例继续优先复用，即使它来自旧版本并运行在其他端口；下次全新启动再采用当前 binding 策略。这样不会为了端口迁移自动停止用户进程，也不会并行创建同 profile 的第二实例。

### 3. macOS App executable 与后台运行器分离生命周期

App executable 继续同步校验 Host Node、package entry 和 SHA-256。校验通过后，它使用 `launchctl submit` 把带唯一 label 的一次性后台运行器提交给当前用户 launchd，并立即退出；后台运行器执行 binding 中的 npm entry、写入 `~/Library/Logs/Buildr/launcher.log`，在非零退出时记录状态和显示现有修复提示，退出时移除自己的临时 job。wrapper 只向 job 转发 `BUILDR_APP_DATA_DIR`、`BUILDR_PRODUCT_DATA_DIR` 与 `BUILDR_LAUNCHER_NO_OPEN` 三个受控运行变量，不复制调用环境中的其他内容。

每个 macOS Launcher 的 `CFBundleIdentifier` 从 closed `launcherOwnershipIdentity` 派生；同 target、同 installation slot 的 v2 refresh 保持稳定，不同 target 或候选 installation 不与正式 App 争用同一个 LaunchServices identity。选择短生命周期 wrapper 而不是让 shell 继续等待 Node，是为了让 LaunchServices 在每次点击时都能重新启动 App executable。选择用户 launchd 管理的一次性运行器而不是原生 App，是因为本次只修复现有薄 Launcher，不引入新的二进制发行、签名或更新渠道。

Windows shortcut 继续直接绑定 Host Node 与 package entry；端口策略由同一 binding 在 Server 内消费，不复制平台逻辑。

### 4. 本地候选验证保持 npm identity 与正式入口隔离

验证使用正式 release artifact builder 生成一次本地 candidate tarball，安装到系统临时或任务隔离的 npm prefix，再从该 npm installation 把 Launcher 安装到独立 candidate target。它可以证明 npm origin、Host Node、entry、binding、4457/回退及 macOS 重开行为，但不发布 Registry、不写当前 `~/Applications/Buildr Web.app`，也不把 development checkout 伪装成正式 npm installation。

## Risks / Trade-offs

- [默认 `4457` 被长期占用时正式 URL仍会变化] → instance receipt、启动日志和浏览器打开最终 URL；下一次全新启动重新尝试 `4457`。
- [listen 与端口占用存在竞态] → 不做预探测，以真实 `listen` 的 `EADDRINUSE` 作为唯一回退依据，并限制为一次重试。
- [v1/v2 ownership identity不同导致无法 repair] → v1 兼容 reader只提取并验证已有 closed material，在同 installation slot、target 和实际结构匹配时允许原子替换；不接受未知或外部 Launcher。
- [后台运行器启动后 App executable 已退出] → 同步 preflight 与 `launchctl submit` 状态保留即时错误；运行期失败由后台运行器写日志并显示提示，runner 退出时移除临时 job，system smoke 等待 instance readiness 验证真实结果。
- [多个本地候选与正式 App 的 LaunchServices identity 冲突] → bundle identifier 从 Launcher ownership 派生；测试同时断言第二次普通 `open` 实际重新执行入口，而不是接受 `already running` 提示。
- [旧健康实例端口不是当前策略] → 先复用，不自动终止；用户通过公开退出动作停止后，新实例再采用 v2 policy。

## Migration Plan

1. 新版本 install/repair 生成 v2 binding，默认 `preferred=4457`。
2. npm package 更新时沿既有同 slot Launcher refresh 路径迁移；refresh 失败保留旧 Launcher 并要求从同一 npm installation repair。
3. 当前运行实例不自动停止；下次全新启动应用新策略。
4. 发布前使用隔离本地 npm candidate 和独立 App target 验证；正式 Registry 发布与用户入口替换留给后续 release 流程。
5. 回滚到旧版本时使用旧 npm installation 重新生成其 own Launcher；不让旧 runtime消费 v2 binding。

## Open Questions

无。用户已确认正式 Launcher 默认首选端口为 `4457`，端口占用时允许随机回退。
