---
name: buildr-dev-preview
description: 在 Buildr 自身开发或验收中，需要启动服务验证时使用；运行对应工作树的 Buildr Web，修改后重新构建并重启预览。仅服务 Buildr 自举工作空间，不作为用户 workspace 的默认能力。
---

# Buildr 开发预览

本技能（Skill）只属于 Buildr 自举工作空间，用于在 Buildr 自身开发或验收需要启动服务验证时，运行对应任务工作树（Worktree）中的 Buildr Web 产品代码，数据与配置默认沿用开发版。它不是随包内置能力，不进入 `projects/product/services/buildr/resources/`，也不写用户级安装说明；用户 workspace 不需要、也不应获得本技能。

## 使用时机

智能体（Agent）根据本次改动和待验证行为判断是否需要启动服务：查看真实页面、检查交互或验证本机 HTTP 行为时，使用本技能（Skill）启动对应任务工作树（Worktree）的预览，并将同一预览链接提供给用户查看。只需静态检查或无需启动服务的测试时，不必启动预览。

## 适用边界

- 仅在本自举 workspace（`projects/product/` 存在产品 checkout）内使用；其他 workspace 没有开发入口与 canonical 任务库语义。
- 用真实页面验收工作树中的前端、任务详情、预览身份等改动；不是日常浏览入口，验收完成后停止实例并清理隔离现场。
- 不替代 `buildr web` 默认实例、`Buildr Web Dev.app` 或正式发布物验证；不修改 canonical workspace 的任务库内容。
- 任务材料坚持工作树证据来源：`task-worktree-candidate` provenance 缺失或漂移时如实呈现诊断，不拿主目录同名旧文件冒充。

## 前置事实核对

1. 确认被验收的工作树根：`git worktree list` 或任务 worktree evidence 给出的 checkout，不从目录名猜测任务归属。
2. 确认产品代码自洽：预览进程必须来自该工作树的 `projects/product/buildr` 开发入口；本机 PATH 上的 `buildr` 是 npm installation，身份不同，禁止用它启动预览。
3. 预览前端默认需要构建产物：在工作树（Worktree）的 `projects/product/services/buildr-web` 运行 `../buildr/tools/development/run-development-npm run build`，输出到 `services/buildr/web-dist`（该目录被 Git 忽略，属于可重建产物）。首次启动时，未改动前端且已有产物与当前源码一致可复用。

## 数据与配置目标（单一逻辑）

预览 = 任务工作树代码 + 开发版数据与配置。没有数据模式选项。

| 场景 | 服务目标（`--target`） | 数据与配置 | 适用 |
|---|---|---|---|
| 任务验收（默认） | canonical workspace 根 | 直接读取开发版登记的真实工作空间和任务库；默认沿用开发版模型目录与智能体运行配置（`--reuse development`） | 代码来自任务工作树，数据与配置与开发版一致 |
| 显式不沿用 | canonical workspace 根 | `--reuse none` 不沿用配置；工作空间数据仍为真实目标 | 需要排除开发版配置干扰时 |
| 空现场 | 隔离新建目录 | 不复制任务库；配合 `--reuse none` | 只验证页面壳层、不依赖任务材料与开发版配置 |

旧 `--workspace-mode` 参数按未知选项显式失败；不再为工作树播种任务库副本。仍在运行的旧 snapshot 实例由原 owner 安全停止或改用新实例名，不自动迁移数据。

## 托管路径（首选）

```bash
<worktree>/projects/product/buildr web preview start <instance> [--task <task-id> --target <canonical-root>] [--reuse <profile>[:facet,...]|none] [--refresh-reuse] [--port 0] [--no-open] [--json]
<worktree>/projects/product/buildr web preview list --json
<worktree>/projects/product/buildr web preview stop <instance> [--task <task-id> --target <canonical-root>] [--purge]
```

- 单一数据目标：`--task` 只解析受管工作树作为代码来源，服务数据目标为 canonical；开发版登记的其他真实工作空间也可直接选择，不再把同 ID 工作树重复登记，也不播种任务库副本。预览会话、端口、进程和登记写入仍隔离，不共享整个开发版数据根。
- 默认沿用 development：沿用开发版模型目录（模型账号、缓存模型与启用偏好）与智能体运行配置（provider 登录配置、所需程序与预览内连接绑定），写入限定在预览实例根内，来源只读。`--reuse none` 显式不沿用；`--refresh-reuse` 可单独使用刷新默认沿用。开发版来源不可用时 fail closed 并提示 `--reuse none` 显式退出，不无声降级。
- 无 `--task` 时从当前开发入口运行代码，`--target` 直接指定真实工作空间；默认沿用同样生效。不要将同 ID 工作树当成另一个真实工作空间登记。
- 沿用只负责模型与智能体运行环境，不负责工作空间列表；列表共享无需该参数。真实工作空间业务写入仍受原有授权、版本和候选来源保护；沿用不解除写入保护。
- 连接页面和查询优先在隔离工作空间验证；真实系统验收另行核对目标及授权。预览通过当前团队实例读取团队认证，本机个人认证属于预览自己的数据目录，不复用日常个人账号；不得把开发工作空间当成业务连接来源。目标改变时使用新实例名，不覆盖已有登记。
- 托管实例持有 owner、secret 与启动锁，`preview stop` 需匹配 owner 身份；不要直接 `kill` 进程绕过 owner 检查。
- 启动输出即为验收链接：loopback URL + 实例名 + worktree/branch/HEAD + dirty 状态 + 数据目标（开发版工作空间；旧实例如实显示工作树快照）+ reuse 来源；向维护者交接时原样给出。旧实例不直接切到真实数据；普通停止会保留数据与登记，清空旧实例须由原 owner 显式使用 `stop --purge` 并核对清理结果。

## 修改后重新验证

修改被预览代码后，重新构建受影响的产物，再停止旧预览并启动新预览。前端改动使用上方构建入口；其他改动按对应服务（Service）的实际构建入口处理。`preview start` 会复用仍在运行的实例，不能仅重复 `start` 或刷新页面就认定已加载修改后的代码。

托管预览沿用当前实例名与任务标识，执行上方 `preview stop` 后再 `preview start`；手工预览核对原进程身份后退出，再按原配方启动。只重启本任务的预览，不停止其他任务或默认实例，不覆盖已有隔离现场。

重新启动后使用本次输出的地址核对代码来源并验证修改；随机端口可能变化，向用户提供新的预览链接。修改前的检查结果不能代替修改后受影响行为的验证。

## 手工配方（仅托管路径不可用时）

托管 `--task` 在旧代码存在运行时缺口（`is not a function`），或需要空现场（未初始化手工根）时，如实降级并显式说明：实例没有 owner/secret 证据，`preview list/stop` 不管控它，停止责任由发起者承担。手工路径不经过预览沿用能力，配置为隔离根自身所有。

```bash
# 1) 隔离应用数据根（预览自己的 instance/registry/previews，绝不指向默认数据目录）
ISOLATED="$(pwd)/.buildr/local/dev-preview/<instance>"; mkdir -p "$ISOLATED"

# 2) 以工作树开发入口 + 隔离数据根 + 随机端口启动；默认实例不受影响
BUILDR_APP_DATA_DIR="$ISOLATED" <worktree>/projects/product/buildr web --target <worktree-or-canonical> --port 0 --no-open
```

- 空现场：`--target` 指向自建的隔离目录（含必要 workspace 身份），不复制任务库；或以 `--target` 省略直接读登记列表。
- 手工实例由 `web` 自身的 instance 生命周期管理（页面"退出 Buildr"或终止进程）；没有 task owner 匹配约束，停止时核对 PID 与 URL。
- 隔离根与该次预览绑定，用后删除；不把隔离根登记进默认 profile。

## 交付与停止

- 报告验收链接、实例身份（worktree/branch/HEAD/dirty、数据目标与沿用来源、是否托管）、所做改动的事实依据；需要持续验收时保持实例运行并说明仍在监听。
- 完成后 `web preview stop`（托管）或退出进程并删除隔离根（手工）； `.worktrees/`、任务分支与 canonical 现场保持原状。
- 预览中发现"任务工作树当前不可读取"、材料来源不是 `task-worktree-candidate` 或 CLI 身份不是工作树 checkout 时，如实报告为产品缺陷，不用主目录文件顶替。