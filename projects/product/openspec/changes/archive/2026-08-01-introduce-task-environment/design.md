## Context

现有 `worktree-application.mjs` 以 `buildr.task-environment-receipt/v1` 同时保存 Git checkout、runtime projection、Workspace Node、候选 CLI、session adoption 和 cleanup 事实，并通过 `buildr worktree create|inspect|context|adopt|cleanup` 对外表达“任务环境”。这套实现证明了 worktree、自举 runtime 和安全清理的基本可行性，但存在四个结构问题：

1. Git worktree 被硬编码成 Task Environment；共享执行根或非 Git Workspace 没有同等环境事实。
2. worktree receipt 同时是 Git evidence 与环境 authority，Preview、Verification、Finish 等消费者直接依赖它，无法替换 provider。
3. 候选 CLI、runtime projection 与 Agent session adoption 混在 ready 判断中，稳定控制面、候选验证和真实 session 证明边界不清。
4. Task Record 和 Local App 只从 retained Project 解析 Change，导致任务环境中尚未集成的 Change 无法关联和展示。

P0.1 已在 canonical Workspace 建立 `.buildr/tasks/<task-id>/task.yml`。P0.2 只接管环境专业事实，不修改 Task Record schema 或顶层状态；Local App 在现有 Task 详情上组合一个独立、只读的环境投影。

## Goals / Non-Goals

**Goals:**

- 让正式 Task 在首次修改交付物、构建、测试或创建持久资源前取得真实 `ready` 的任务环境（Task Environment）。
- 让一份环境回执（Environment Receipt）成为 ready、恢复、runtime projection identity、动态资源和 cleanup 的唯一 Task 级 authority。
- 让 Git worktree 收窄为可替换 provider，只保留 Git evidence 与安全 Git cleanup。
- 由产品确定性完成准备、探测、资源登记与清理；失败保留现场并返回稳定 `blocked` 结果。
- 让 CLI、Skills、Local App、Preview 和 Finish 复用同一 Application，不复制环境 writer 或判断。
- 让 Task Record 持有稳定的 `{project, change}` 逻辑引用，同时正确读取任务环境中的未集成 Change。
- 在同一 Change 中完成旧数据迁移、authority 切换和冲突旧 mutation/routing 清退。

**Non-Goals:**

- 不建设 Task Core、数据库、通用 environment registry、通用状态机、锁、CAS、租约、调度器或同 Task 多 writer 并发。
- 不把 Task Environment、Environment Receipt、worktree、Workspace、retained Workspace、任务验证工作区或 Agent runtime 视为同一对象。
- 不把环境字段、专业记录引用、Task 计划、开发进度、验证结果、Agent session、凭证或完整日志写入 Task Record/Environment Receipt 的错误 owner。
- 不证明 Agent 已在真实 session 采用候选 runtime；该证据属于 P0.4 Task Verification。
- 不在 Local App 提供 Environment prepare/cleanup mutation、持续实时订阅或完整专业操作台；Board 与后续专业结果聚合仍属于 P1.2。
- 不把任务环境中的 Change 混入 Workspace 全局 Change 列表，也不建设通用多根内容历史系统。

## Authority 与调用关系

| 层 | 责任 |
|---|---|
| Task Record | Task identity、Intent、顶层状态、Project/Service scope 与 `{project, change}` 逻辑引用；不保存环境字段 |
| Task Environment Application | 环境准备、只读检查、恢复、资源登记/释放、cleanup 与唯一 Environment Receipt 写入 |
| Git worktree provider | repository、checkout、branch、HEAD、clean、registration 与 Git cleanup evidence |
| Task-scoped Change Reference Resolver | 按 Workspace、Task ID、Project/Change 引用选择安全读取根并返回 provenance；不持久化第二份 Change 状态 |
| Local App | Task Record 客户端，并组合 Environment/Change 的只读 read model；不解析 receipt、不直接写文件 |
| Task Verification | Candidate、验证政策、实际 evidence 与需要时的 Agent session proof |

## Decisions

### 1. 共享 Application 是唯一环境 writer，CLI 保持薄而公开

新增任务环境应用（Task Environment Application），固定提供：

| Application 动作 | 责任 | 公共 CLI |
|---|---|---|
| `prepare` | 首次准备或从现有 receipt 幂等恢复；完成真实 probe 后返回 ready/blocked | `buildr task environment prepare <task-id>` |
| `inspect` | 只读读取并复核当前机器真实环境 | `buildr task environment inspect <task-id>` |
| `resource register/release` | 供 Preview、dev server 等已知产品 provider 登记或释放持久资源 | 首版不公开 |
| `cleanup` | 消费 Finish 或明确放弃授权，编排 provider cleanup | `buildr task environment cleanup <task-id>` |

CLI interface 只解析参数、调用 Application、映射输出和退出码。三个公共命令统一返回 `buildr.task-environment-result/v1`；Application 不解析 argv、打印 stdout/stderr 或修改 process exit state。`prepare` 已包含恢复，因此不增加 `restore` 命令。

`task-environment` Skill 调用公共 CLI；Local App、Preview 与 Finish 在产品内部直接调用同一 Application，不 shell out。调用方只能提交 Task ID、明确 scope/授权和 provider handoff，不能提交完整 next-state receipt 或任意 cleanup 命令。

Buildr 自举时，authoritative mutation 始终由 retained Workspace Foundation 的稳定 controller 执行；任务 worktree 内候选 CLI 只作为本任务验证工作区中的测试对象，不能认领或清理自己的环境。

### 2. Environment Receipt 使用独立 v2 schema 和 canonical 本机路径

每个 Task 的唯一环境记录固定为：

```text
<canonical-workspace>/.buildr/tasks/<task-id>/environment.json
```

schema identity 使用 `buildr.task-environment-receipt/v2`，与 worktree-centric v1 明确不兼容。根 `.gitignore` 精确忽略 `/.buildr/tasks/*/environment.json`，不忽略同目录的 `task.yml` 或其他可移植专业记录。

最小内容分为六组：

- `taskId` 与 canonical Workspace identity/root；
- 工作范围、实际执行根、任务验证工作区根、共享/占用与 cleanup owner；
- 稳定 controller identity；
- Runtime、Workspace CLI、package manager/lockfile、依赖结果和 runtime source/projection identity；
- provider evidence 引用，以及 Preview、dev server、端口、容器等持久资源的 provider identity、非敏感 cleanup handle 与当前事实；
- 最近一次 `ready / blocked` 探测与最终 cleanup 结果、时间和最小诊断。

Receipt 不复制 Git provider 的完整 evidence，不保存 Agent session、凭证、任意命令、依赖内容、生成 runtime 文件或完整日志。repository 每次从磁盘最新内容开始，完整校验后用同目录临时文件和 rename 精确替换 `environment.json`；不对整个 Task 目录声明 transaction、rollback 或 ownership。

### 3. Environment 记录实际位置，Git worktree 只是可选 provider

Receipt 直接记录每个工作范围的实际执行根、共享情况和 provider，不增加 `in-place / dedicated` 等顶层 mode。

- 没有 Git 或不需要隔离时，可以登记 canonical Workspace 内已有执行根。一个共享修改根同一时刻只允许一个范围重叠的修改型 Task 占用；第一版不建设文件级 write-set，cleanup 保留共享源码，只确定性释放已登记资源和 Environment 占用。
- Git 需要隔离时，Application 调用 Git 工作树提供方（Git worktree provider）。`.worktrees/` 是多个任务环境 checkout 的容器；`.worktrees/<task-id>` 可以同时是 checkout、执行根和任务验证工作区根。
- 多 repo 只接受显式 Project/Service selector，并按 registry、真实 Git boundary 与 canonical `source.path` 解析；一份 Receipt 不跨多个独立 Buildr Workspace。

新增窄 `buildr.git-worktree-provider/v1` 与 `buildr.git-worktree-evidence/v1`。evidence 保存在 Git common-dir 的 `buildr/task-worktrees/<task-id>.json`，只拥有 repository/checkout/branch/HEAD/remote/clean/registration/Git effects。它不判断 Runtime、依赖、`ready`、恢复、资源、session 或总 cleanup。

`buildr worktree create|inspect|cleanup` 可以保留为 provider-level 公共表面，并统一使用新的 `buildr.git-worktree-result/v1`，不延续 environment-shaped JSON 字段；`worktree context|adopt` 删除。正式 workflow 只能通过 Task Environment Application 编排 provider。

### 4. Local App 在 Task 详情提供独立只读“环境”页签

P0.2 在现有 `/workspaces/:workspaceId/tasks/:taskId` 详情页增加“环境”页签，保留原 Task 概览/Task Record 数据块。Environment 不是 Task Record 字段，也不把专业状态折叠成 Task 顶层状态。

页面通过路径安全的 Workspace-scoped API（例如 `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/environment`）调用 Application `inspect`。HTTP/Web 层不能接收调用方文件路径、读取/解析 receipt 或复刻 ready 判断。

页签展示：

- `current machine` 来源、`observedAt` 与 receipt 是否存在；
- `ready / blocked / drift / cleaned / unavailable` 及稳定诊断；
- 工作范围、实际执行根与任务验证工作区根；
- Runtime、Workspace CLI、依赖和 runtime projection identity/状态；
- Git/其他 provider evidence 摘要；
- Task-owned 动态资源与最近 cleanup 结果。

“实时”定义为打开页签、页面重新获得焦点或用户手动刷新时执行一次当前机器只读 probe，并显示 `observedAt`；响应使用 no-store 语义。首版不增加 WebSocket、后台持续订阅、全量高频轮询或 prepare/cleanup mutation 按钮。

### 5. Task-scoped Change Reference Resolver 负责跨 retained/Environment 解析

Change 在 active work 期间保存在任务环境的 Project checkout；不能为了让旧 validator 识别而提前写入 retained Project。Task Record 仍是 `{project, change}` 逻辑关联的唯一可移植 owner，不保存 checkout path、environment identity 或 provenance。

新增任务范围 Change 引用解析器（Task-scoped Change Reference Resolver）。输入只包含 canonical Workspace、Task ID 与限定 `project/change`；解析器通过 Task Environment 的只读 port 获取匹配 Project scope 的实际执行根，不能信任请求 path、cwd、branch，也不能让 Task Record Application 或 Web 直接读取 Environment Receipt。

解析顺序与结果：

1. 有匹配且可验证的 active Task Environment Project root 时，从该根读取任务工作副本，并识别 active 或 archived lifecycle；
2. 同时检查 retained Project canonical root，作为已集成/归档事实或 baseline provenance；
3. 没有可用任务环境副本时，回退到 retained Project；
4. 两处都不可用时返回稳定 `unavailable/not-found` 诊断，不猜路径、不创建目录。

当两处都有同名 active Change 时，Task-scoped detail 将任务环境副本标为 `task-environment candidate`，retained 副本标为 `retained baseline`；不静默合并内容。候选集成后，同一逻辑引用自然解析到 retained source。Workspace 全局 Change list 继续只索引 retained Project，不混入任意任务候选。

Task Record 的 closed schema/domain validator 保留，但“validator”不是独立 authority。新增 Change 引用时，Application 通过共享 Resolver 确认引用当前可解析；现有引用暂时不可用时：

这里替换的是“只查 retained Project”的旧位置判断，不删除 `openspec validate`。后者继续校验 Resolver 所选 Change 的 artifacts 与 spec 契约，但不决定 Change 必须放在哪个 checkout，也不拥有 Task 与 Environment authority。

- Task inspect/list 必须仍返回 Task Record，并附引用诊断；
- 删除该失效引用或修改与它无关的字段必须可继续；
- 不得因另一台机器没有本机 Environment Receipt 而隐藏整条 Task；
- Local App Task 详情与 Task Record Application 必须复用同一 Resolver，不实现第二套路由。

### 6. `ready` 来自实际执行根的最小真实 probe

`prepare` 先确认正式 Task Record 存在且仍允许继续，再从 canonical Workspace、Project、Service 和现有 runtime/command authority 解析计划。任何事实缺失或冲突都返回 `blocked`，不从 cwd、branch、remote 名称或技术栈惯例猜测。

固定顺序为：

1. 创建/读取 Environment Receipt，核对 Task/Workspace identity；
2. 占用共享执行根，或调用 provider 准备隔离 checkout；
3. 在每个实际执行根准备受支持的 Runtime、Workspace CLI 和依赖；
4. 将 workspace-scoped 候选 Agent runtime 投射到该 Task 自身的任务验证工作区；
5. 对执行根、provider identity、Runtime、CLI、lockfile/依赖和 projection identity 做最小真实 probe；
6. 全部 required scope 通过才写入 `ready`，否则保留已创建资源并写入 `blocked` 与 next action。

Buildr 自举 Node checkout 使用 Receipt 绑定的 Workspace Node/npm，在自己的 lockfile 目录执行确定性 `npm ci`；不同 checkout 不链接或复用 `node_modules`，只允许 package manager 下载缓存共享。其他栈只有在当前 authority 和受支持 adapter 能确定解析时才自动准备，否则明确 `blocked`。

`ready` 只说明环境已知且可执行，不承诺物理完全隔离，也不代替业务测试或 Candidate verification。

### 7. 任务验证工作区只承载候选投射，不证明 Agent session 采用

worktree-backed 自举环境把 `.worktrees/<task-id>` 作为任务验证工作区根。候选 Buildr CLI 可以只向该根投射候选 Rule、Skill、contract 与 runtime，也可以在根内使用隔离模拟用户目录测试 user destination。产品在写入前阻止候选 source 更新 retained Workspace、peer task worktree 或验证根之外的共享 user runtime。

Environment Receipt 只登记 runtime source/projection identity、activation metadata 和 projection probe。真实 Agent session 是否加载候选内容不影响普通 `ready`；需要该证据时由 P0.4 Task Verification 持有 Verification Result。

### 8. 动态资源由已知 provider 登记，Environment 统一 cleanup

只有跨当前有界操作持续存在、需要最终清理或影响并发的资源才登记。资源条目只保存 `kind`、稳定 identity、所属 scope、provider、必要的非敏感 cleanup handle、实际 probe 与状态；cleanup 只能分派给已登记产品 provider，不能执行 Receipt 中的任意 shell 文本。

Local App Preview、dev server 等创建者必须在资源健康后立即调用稳定 Application 登记。登记失败时，创建者停止刚创建的资源并证明回收；只有登记成功才能报告 start 成功。

正常完成时，Task Finish 先完成交付并提供各 scope 的 delivery identity 与 cleanup eligibility。Task Environment 再停止资源、调用 provider cleanup、解除共享根占用，并写回 removed/retained/blocked 结果。Finish 不直接扫描资源、删除 worktree/branch 或写第二份环境结论。

明确放弃时，只有上层已处置关联 Change/保留事实且 ownership 可证明，Environment 才能清理 Task-owned dirty worktree 或资源。来源不明共享内容、混合 ownership、远端分支与不能安全回滚的非 Git 内容保持现场并返回 `blocked`。

### 9. 恢复按 Task ID 串行复核，不建设并发协议

更换 Agent/session 后，调用方先通过 Task Manager 恢复顶层 Task，再由 Task Environment 按 Task ID 找到 canonical Receipt。`inspect/prepare` 都重新探测执行根、provider、Runtime/CLI、依赖、projection 和动态资源；`inspect` 只在响应中返回本次 `observedAt` 与观察事实，`prepare` 才能按恢复结果更新 Receipt。两者都不得按 cwd、branch 或相同 HEAD 认领环境。

第一版假设同一 Task 同一时刻一个 active writer。Application 动作从最新 Receipt 和真实事实开始；发现其他 writer 的可见效果、identity 冲突、范围重叠或调用方依据已过期时返回 `blocked`。该边界不承诺锁、CAS、自动 merge 或并发安全。

### 10. 一次性迁移后删除旧 authority，不保留 permanent adapter

旧 `buildr.task-environment-receipt/v1` 只能由与正常 routing 隔离的一次性 reader/migrator 读取。切换时对每份真实旧数据按以下四类处理：

| 类别 | 条件 | 结果 |
|---|---|---|
| A 正式活跃环境 | 正式 Task 存在，live worktree 与 Task/Workspace/repository/branch/path identity 匹配 | 写入 v2 Environment Receipt 与 Git provider evidence，重新 probe，成功后删除旧 receipt/adoption state |
| B 活跃孤立 worktree | live worktree 存在，但没有正式 Task | 只生成/保留窄 Git provider evidence，不创建 Task 或 v2 Environment Receipt；evidence 复核后删除旧环境 receipt |
| C 陈旧 receipt | 没有 live worktree 或其他真实资源 | 证明无资源后删除旧 receipt；不创建新 authority |
| D identity 冲突 | ownership、Task、Workspace 或 Git identity 无法确定 | 阻止该 Workspace 的 P0.2 authority 切换，原样保留 bytes/资源并要求人工解决 |

当前 retained Workspace 的探索快照中存在 33 份 `.git/buildr/task-environments/*.json`，均为 v1；该数量只是本次迁移审计输入，不是长期规范。实现时必须重新枚举实际数据并记录每份分类结果。

同一 package/cutover 必须删除：

- `buildr.task-worktree-lifecycle@1/@2` contracts、bindings 和 consumer edges；
- 旧 environment writer、`worktree context|adopt`、adoption receipt/session logic；
- 旧 environment-shaped JSON/help/docs/runtime routes；
- `resolveTaskEnvironmentContext` 等直接旧 receipt consumers；
- 重复 package/runtime copies、canonical guidance 与旧 shape tests（只保留精确一次性迁移 fixture）。

根层旧 contract 文件、manifest entry 与 binding 通过新 contract 的显式 replacement 声明一起退休。`sync` 先核对旧 capability/version、provider、目标路径和文件 SHA-256；全部匹配才删除，任一漂移都在退休 mutation 前阻断并保留现场。

静态残留 gate 只允许旧 identity/string 出现在明确 migration module、migration fixtures、OpenSpec delta/history 中。capability graph、CLI registry/help、public JSON registry、Application registration/router、package/runtime assets、真实 `.git/buildr` 数据与 E2E 任一仍有可达旧 writer/routing 时，P0.2 不得宣告 active。

## Risks / Trade-offs

- **[公共 CLI 增加产品表面]** → 只公开 prepare/inspect/cleanup 三个高层动作，共用一个结果 schema；资源登记保留内部，不暴露 provider 细节或任意命令。
- **[Local App inspect 可能耗时]** → 只做有界只读 probe，按打开/聚焦/手动刷新触发并显示 `observedAt`；不引入持续订阅。
- **[Task-scoped Change 有两个可见副本]** → 明确返回 candidate/baseline provenance，不合并、不更改全局 retained-only 列表。
- **[依赖准备可能耗时]** → 以 lockfile/runtime identity 和真实 probe 复用已准备 checkout；只有缺失、变化或 probe 失败时重新准备。
- **[历史 receipts 质量不一]** → 全量分类后一次性迁移；任何未知 ownership 阻止 authority 切换，不用永久 adapter 掩盖冲突。
- **[没有锁无法保证同 Task 并发写入]** → 首版单 writer、串行恢复；可见漂移即 blocked，不扩成通用并发系统。
- **[共享执行根隔离较弱]** → Receipt 显式记录占用与范围；修改范围重叠或 ownership 不清时 fail closed。
- **[候选 runtime 已投射但 Agent 未采用]** → Environment 只报告 projection ready；专项 session proof 留给 Task Verification。

## Migration Plan

1. 实现 v2 Environment Receipt Domain/repository、Task Environment Application、公共 CLI/JSON 与只读 inspect read model；保持旧 selected bindings 未切换。
2. 实现窄 Git provider、Task-scoped Change Reference Resolver、Local App 环境页签/API，并迁移 Preview/Finish 等正式 consumers 到新 Application。
3. 在临时 Workspace 覆盖共享根、单/多 repo worktree、Node 依赖、Change candidate/baseline、Local App inspect、Preview 登记、Finish handoff，以及 A/B/C/D 四类旧数据。
4. 重新审计 retained Workspace 的真实 v1 receipts 与 active routing，对每份数据完成分类；canonical `sync` 先完成只读分类和 source preflight，遇到 D 类或 source 冲突时零迁移并保留现场。
5. 在同一候选中切换 package contracts、bindings、consumer edges、CLI/help/JSON registry；通过 identity-bound replacement 删除根层旧 contract/binding，并删除所有旧 mutation/routing 与重复 runtime/package assets。
6. 通过静态 residual gate、checkout/npm parity、package/runtime E2E 和本任务验证工作区验收后，才允许候选集成。
7. 候选进入 retained source 后，从 retained source 执行 sync/render/doctor，并确认真实旧数据已完成迁移且无旧 authority 可达，才把 P0.2 标记为当前事实。

降级不能重新启用旧 writer。若 v2 已写入后发现缺陷，修正版必须继续读取/清理 v2 并保留现场。

## Roadmap 对齐要求

候选中的 Roadmap 已与本设计对齐，并保留了 retained Workspace 原有的两份未提交更新；retained Workspace 本身未被候选覆盖。已对齐内容包括：

- P0.2 明确交付共享 Application、薄公共 CLI、Task 详情“环境”页签与 Task-scoped Change Resolver；
- “Task Record 不接收环境字段”与“Local App 可组合只读专业投影”分开表达；
- P1.2 保留 Board 与后续 Review/Verification/Finish 专业投影，不再拥有首个 Environment 投影；
- 明确 canonical 路径为 `environment.json`；旧 v1 worktree receipt 在一次性迁移后退出，长期保留的是新的窄 Git provider evidence；
- 对 `.worktrees/<task-id>` 补全“不是 retained Workspace、Agent runtime 或开发 Workspace”的术语边界；
- P0.2 同 Change 完成一次性迁移与旧 authority 清退，不保留 permanent legacy adapter。

这些 Roadmap 表述只有随候选集成进入 retained source 后才成为 retained 文档事实；在此之前不得据此宣称 P0.2 已生效。

## Open Questions

没有需要用户决定的阻塞语义。实现中的模块文件名和测试分组可以沿用现有 Application/Interface/Repository 分层，但不得改变上述 authority、路径、CLI、Local App、Change 解析、迁移与非目标边界。
