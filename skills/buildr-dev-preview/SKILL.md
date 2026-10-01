---
name: buildr-dev-preview
description: 在 Buildr 自身开发或验收中，需要启动服务验证时使用；运行对应工作树的 Buildr Web，修改后重新构建并重启预览。仅服务 Buildr 自举工作空间，不作为用户 workspace 的默认能力。
---

# Buildr 开发预览

本技能（Skill）只属于 Buildr 自举工作空间，用于在 Buildr 自身开发或验收需要启动服务验证时，运行对应工作树（Worktree）中的 Buildr Web 产品代码，叠加指定的任务数据源。它不是随包内置能力，不进入 `projects/product/services/buildr/resources/`，也不写用户级安装说明；用户 workspace 不需要、也不应获得本技能。

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

## 数据源模式

| 模式 | 服务目标（`--target`） | 任务数据 | 适用 |
|---|---|---|---|
| canonical 实时库 | canonical workspace 根 | canonical `.buildr/local/workspace.sqlite` 实时读取 | 需要真实任务记录、工作树材料经受管证据（`task-worktree-candidate`）解析的验收 |
| 隔离快照 | 任务工作树根 | 启动前以一致副本为工作树 `.buildr/local/workspace.sqlite` 播种 | `--task` 预览形态、需要冻结数据时点或隔离页面内写入 |
| 空现场 | 隔离新建目录 | 不复制任务库 | 只验证页面壳层、不依赖任务材料 |

快照播种只允许写工作树自身 `.buildr/local/`；canonical 库始终只读。已存在的工作树本地副本复用，不覆盖。

## 托管路径（首选）

```bash
<worktree>/projects/product/buildr web preview start <instance> [--task <task-id> --target <canonical-root>] [--port 0] [--no-open] [--json]
<worktree>/projects/product/buildr web preview list --json
<worktree>/projects/product/buildr web preview stop <instance> [--task <task-id> --target <canonical-root>]
```

- `--task` 形态：自动解析任务受管工作树、服务目标指向工作树、为目标缺失的本地任务库从 canonical 播种一致副本（结果 `taskStore` 如实标注 `canonical` 播种或 `existing` 复用）。这是隔离快照模式的托管实现，优先使用。
- canonical 实时库模式：`web preview start <instance> --target <canonical-root>` 不提供 `--task`，服务目标为 canonical，任务材料按 worktree evidence 读工作树候选副本。
- 托管实例持有 owner、secret 与启动锁，`preview stop` 需匹配 owner 身份；不要直接 `kill` 进程绕过 owner 检查。
- 启动输出即为验收链接：loopback URL + 实例名 + worktree/branch/HEAD + dirty 状态 + 任务库来源；向维护者交接时原样给出。

## 修改后重新验证

修改被预览代码后，重新构建受影响的产物，再停止旧预览并启动新预览。前端改动使用上方构建入口；其他改动按对应服务（Service）的实际构建入口处理。`preview start` 会复用仍在运行的实例，不能仅重复 `start` 或刷新页面就认定已加载修改后的代码。

托管预览沿用当前实例名、任务标识和数据源模式，执行上方 `preview stop` 后再 `preview start`；手工预览核对原进程身份后退出，再按原配方启动。只重启本任务的预览，不停止其他任务或默认实例，不覆盖已有隔离任务库。

重新启动后使用本次输出的地址核对代码来源并验证修改；随机端口可能变化，向用户提供新的预览链接。修改前的检查结果不能代替修改后受影响行为的验证。

## 手工配方（仅托管路径不可用时）

托管 `--task` 在旧代码存在运行时缺口（`is not a function`），或所选模式不是托管语义（空现场、未初始化手工根）时，如实降级并显式说明：实例没有 owner/secret 证据，`preview list/stop` 不管控它，停止责任由发起者承担。

```bash
# 1) 隔离应用数据根（预览自己的 instance/registry/previews，绝不指向默认数据目录）
ISOLATED="$(pwd)/.buildr/local/dev-preview/<instance>"; mkdir -p "$ISOLATED"

# 2) 隔离快照模式：为工作树播种一致副本（缺失才播种，不覆盖既有副本）
[ -f "<worktree>/.buildr/local/workspace.sqlite" ] || {
  mkdir -p "<worktree>/.buildr/local"
  sqlite3 "<canonical>/.buildr/local/workspace.sqlite" ".backup '<worktree>/.buildr/local/workspace.sqlite'"
}

# 3) 以工作树开发入口 + 隔离数据根 + 随机端口启动；默认实例不受影响
BUILDR_APP_DATA_DIR="$ISOLATED" <worktree>/projects/product/buildr web --target <worktree-or-canonical> --port 0 --no-open
```

- 空现场模式：`--target` 指向自建的隔离目录（含必要 workspace 身份），不复制任务库；或以 `--target` 省略直接读登记列表。
- 手工实例由 `web` 自身的 instance 生命周期管理（页面"退出 Buildr"或终止进程）；没有 task owner 匹配约束，停止时核对 PID 与 URL。
- 隔离根与该次预览绑定，用后删除；不把隔离根登记进默认 profile。

## 交付与停止

- 报告验收链接、实例身份（worktree/branch/HEAD/dirty、任务库来源与是否托管）、所做改动的事实依据；需要持续验收时保持实例运行并说明仍在监听。
- 完成后 `web preview stop`（托管）或退出进程并删除隔离根（手工）； `.worktrees/`、任务分支与 canonical 现场保持原状。
- 预览中发现"任务工作树当前不可读取"、材料来源不是 `task-worktree-candidate` 或 CLI 身份不是工作树 checkout 时，如实报告为产品缺陷，不用主目录文件顶替。
