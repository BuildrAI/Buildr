# 页面分阶段更新设计

## Context

更新链路所需的既有机制：`releaseAwareness`（registry 双轨道查询 + `release-awareness.json` 持久化去重）、`identifyCliSource`/`inspectProductUpdateAuthority`（npm 安装来源与 receipt 绑定 authority）、`executeCliUpdatePlan`（`npm install --global` 精确版本）、`handoffUpdatedBuildrWeb`（`--update-handoff` 交接端口，`expectedVersion` 入参本就为「先装后交接」预留）。HTTP 层 contribution 通过 `handleTopLevel` + `authorizeWrite` 获得与 `app/*` 相同的 Origin/session 写保护；前端已有 `releaseAwarenessApi`、`ReleaseAwarenessBanner`（挂载时查一次）与 `waitForRestart` 重启观察。

## Goals / Non-Goals

**Goals:**

- 更新任务作为 Installation Application 的进程内单例任务存在，状态可被页面读取；
- 准备阶段只完成 registry 核对与包下载，不触碰运行中的安装；
- 应用阶段复用 CLI 更新同一 authority 安装钉住版本，再经既有交接端口完成接管；
- 前端提供周期检查、图标提示、详情弹层与二次确认交互。

**Non-Goals:**

- 不持久化更新任务（实例生命周期内的内存状态；下载成果由 npm 缓存持有）；
- 不引入服务端定时调度器，周期检查由页面发起；
- 不实现下载字节级进度，不处理非 npm 渠道与多实例并发更新；
- 不改变 `buildr update` CLI、release-awareness 端点与交接语义。

## Decisions

### 1. 任务编排放在 Installation Application，状态为内存单例

新增 `application/update-flow.ts`：模块 `create()` 时构建单例，注入 `productRoot`、既有 `releaseAwareness` 方法与延迟绑定的 `handoffUpdatedBuildrWeb` 端口（复用 `registerApplicationCliUpdate` 的同一 thunk）。状态机 `idle → preparing → ready|failed → applying`；`ready/failed/idle` 允许新 prepare，`preparing/applying` 冲突拒绝。任务随实例重启自然回到 `idle`——已下载的包仍留在 npm 缓存，重新准备的开销只是 metadata 查询，无需持久化任务文件。

*备选：* 持久化任务到产品数据根。否决——跨重启恢复「ready 待确认」没有用户价值，且新增一份状态权威要处理版本漂移。

### 2. 准备阶段用 `npm cache add`，应用阶段 `--prefer-offline` 安装

prepare 在校验通过后异步执行 `npm cache add <pkg>@<version>`（使用 updateAuthority 的 Host Node 与 npm CLI）：tarball 落进 npm 内容寻址缓存并完成完整性校验；apply 使用与 `executeCliUpdatePlan` 相同的 `npm install --global --prefix <p> <pkg>@<version>` 参数加 `--prefer-offline`，命中缓存即无网络往返，缓存未命中时自动回退下载，行为不降级。

*备选：* `npm pack` 落盘暂存 tarball、apply 时从文件安装。否决——需要自己校验 `dist.integrity`、管理暂存目录清理，且从文件安装弱化 registry 完整性校验语义。

### 3. registry 核对保持同步、下载与安装走异步

prepare 内的 release-awareness 调用沿用 `spawnCommandSync`（有界 5s、用户主动触发、每次准备仅一次），长耗时的 `npm cache add`/`npm install` 走新增的异步 `spawnCommand`（放在 `infrastructure/process.ts`，与 `spawnCommandSync` 共享 Windows 调用封装）。

*备选：* 把 release-awareness 整体异步化或放进 Worker。否决——改动面大且收益有限；同步核对只发生在用户点击更新的瞬间。

### 4. apply 先响应、后执行，恢复交给既有重启观察

`handoffUpdatedBuildrWeb` 设计本就允许「由旧服务自己发起的更新调用」（子进程 detached、断开诊断通道但不杀子进程）。因此 apply 校验后立即返回 `202` 任务快照，安装→交接在后台推进：安装失败转 `failed` 可重查；交接发生时旧进程退出、status 端点自然失联，页面复用 `waitForRestart` 轮询会话令牌变化后刷新。与 `quit/restart` 的「响应先于副作用」语义一致。

### 5. 前端以顶栏图标入口取代横幅，交互归入 `features/installation`

`ReleaseAwarenessBanner` 由新的 `UpdateEntry`（图标按钮 + 详情弹层）取代：页面可见时 60s 轮询（沿用 `visibilityState` 门控惯例）、点击立即检查；详情复用 banner 已有的「复制命令 / 交给 Agent」动作，并新增「更新 → 就绪确认 → 安装重启」主流程。Preview 实例不渲染入口。

### 6. development checkout 复用同一状态机，只替换副作用执行

开发版需要演示完整更新交互但不能触碰真实 registry 与安装。实现上不另起前端假流程，而是让 update-flow 按来源分流：`identifyCliSource` 判为 `development` 时 prepare/apply 走本地模拟——跳过 registry 核对、authority 校验、子进程与网页交接，用受控延时推进 `preparing→ready→applying→completed`；状态机、版本钉住、忙冲突与 HTTP 契约全部保持真实。前端在 development 渠道把详情换成「开发模拟」视图（本地推算的目标版本、无复制命令/Agent 动作），任务 `completed` 后调用既有 `/api/v1/app/restart` 真实重启开发实例，重启观察与新实例恢复路径与 npm 流程一致。unknown 来源仍拒绝；Preview 由路由把 `previewIdentity` 传入 contribution 拒绝写入口。

*备选：* 前端纯造假（不经过服务端）。否决——状态机、轮询与二次确认都得不到验证，与真实流程的偏差要靠额外测试兜底；服务端分流用同一契约换副作用执行，演示可信度最高且改动集中在 update-flow 一处。

## Risks / Trade-offs

- **旧进程踩在新文件上的窗口** → apply 把安装与交接合并进同一确认后窗口（秒到几十秒），与现状一致；不做长时间「装好待命」。
- **多标签页同时发起 prepare/apply** → 单例状态机冲突拒绝；status 为各标签共享事实。
- **确认后又发新版** → 装钉住版本而非追新，`expectedVersion` 两端校验；新版会在下一轮周期检查出现。
- **npm 缓存与用户缓存目录不一致** → `--prefer-offline` 未命中时自动回退下载，只损失速度不损失正确性。
- **准备时同步 registry 查询短暂阻塞事件循环** → 有界且仅一次，可接受；后续若有需要再迁入 Worker，不影响契约。

## Migration Plan

- 新增端点与前端入口随同一 package 发布，无跨版本调用承诺；`release-awareness` 端点与 CLI 行为不变。
- 回滚 = 移除新 operation 与前端入口，既有检查/更新路径不受影响。
