## Context

Buildr 只有一个 npm `bin`，但当前 CLI 产品表面由多份独立事实拼成：`registry.mjs` 决定可执行 route，`help.mjs` 维护根帮助、leaf/aggregate topic 和候选建议，架构验证再硬编码一份 expected key 列表，文档与 OpenSpec 另行描述 public、maintenance 和 legacy 分类。它们没有共同的结构化 identity，因此新增和删除 command 时无法确定性证明 dispatch、help、分类和验证同步变化。

CLI 的主要调用者是 Agent。低频或机器导向不等于可以取消稳定 CLI：Review/Verification Result writer、Task Environment、runtime reconcile 等入口用于隔离 Application authority，避免 Skill 直接操作 SQLite、manifest 或内部 JavaScript API。本 Change 只收敛接口事实，不合并这些领域模块。

OpenSpec `sync-plan`/`sync-apply` 是旧分阶段收敛协议。当前 `openspec-contract-guard` 只使用 proposal `check` 和单一 `converge`；`sync-plan`/`sync-apply` 没有当前 Skill/Component consumer，其规划与应用 primitive 已由 `converge` 内部组合。

## Goals / Non-Goals

**Goals:**

- 让每个 retained CLI route 只在一个结构化 descriptor 中声明 key、surface、summary、help、匹配和执行 adapter。
- 从同一 catalog 派生 dispatch candidates、根帮助分区、leaf topic 和表面一致性验证。
- 显式区分 `primary`、`agent-machine`、`maintenance`、`legacy`，降低普通用户认知负担而不破坏必要 Agent 接口。
- 删除 `openspec sync-plan`/`sync-apply` 的 route 和专属 Application/JSON surface，同时让 `converge` 继续复用内部 deterministic primitives。
- 以 focused tests 证明所有 retained route 可发现、声明分类合法、聚合 topic 可达、删除项不可执行。

**Non-Goals:**

- 不重命名或合并 Task、Runtime、Rules、Skills、Commands、Components、Builtins 等领域命令。
- 不在本 Change 删除仍有 consumer 的 `openspec baseline create`、阶段型 `openspec check` 或 `skills migrate-project-assets`。
- 不引入插件式 command registry、动态加载、权限系统、Shell completion 或第二个 CLI binary。
- 不改变 retained command 的参数、effects、JSON schema 或 Application authority。

## Decisions

### 1. 扩展唯一 command registry，而不是新增第二份 catalog

`COMMAND_REGISTRY` 继续是 composition root，但每个 descriptor 增加封闭 metadata：

- `key`：canonical leaf command identity；
- `surface`：`primary | agent-machine | maintenance | legacy`；
- `summary`：根帮助或分组帮助使用的简短说明；
- `help`：canonical leaf topic lines；
- `match` 与 `run`：现有 dispatch adapter；
- 可选 `replacement`：legacy replacement；
- 可选 `group`/`groupHelp`：不执行的 aggregate topic。

`help.mjs` 只实现 topic 解析、分组渲染和诊断，不再保存 leaf command 的第二份 switch/map。`dispatch`、unknown-command candidates 与 help 都消费同一 descriptor 集。聚合 topic 通过同一 catalog 的非执行 group descriptor 声明，避免 `task finish` 这类 topic 只存在于 spec。

备选方案是在新文件维护纯 metadata，再按 key 与 handler map join；它仍允许 metadata 与 executable handler 单边变化，因此不采用。把所有实现写入一个超大入口同样不采用；descriptor 的 `run` 继续委托现有 interface/Application。

### 2. Surface 只控制发现层级，不改变授权或可执行性

- `primary`：普通用户/Agent 的主产品路径，进入根帮助主区。
- `agent-machine`：稳定、支持的 Agent/Skill 机器接口，进入根帮助高级区并具有完整 topic。
- `maintenance`：产品构建、开发预览和内部 workflow，进入明确维护区。
- `legacy`：兼容窗口内仍可执行，默认不进入 canonical 主路径；topic 必须显示 replacement/退役说明。

Surface 不是权限边界。任何 destructive 或授权语义继续由具体 Application/Skill contract 决定。

首版按以下 family 固定分类；一个 family 内存在不同 surface 时显式拆开：

| Surface | Command families |
|---|---|
| `primary` | `help`、`version`、`init`、`app`、`app launcher *`、`bootstrap guide`、`project create`、`service create`、`task create|inspect|update|complete|abandon`、`doctor`、`runtime list`、`sync`、`update|update check`、`rules add|remove`、`skills add|remove|bind|unbind`、`commands add|remove|check`、`component *`、`builtin *` |
| `agent-machine` | `worktree *`、`verification run|cleanup`、`task review *`、`task verification *`、`task environment *`、`task finish *`、`mutation recover`、`render`、`runtime check`、`skill install`、`skills render`、`rules render` |
| `maintenance` | `app preview *`、`package check|build`、`openspec converge|audit` |
| `legacy` | `openspec baseline create`、`openspec check`、`skills migrate-project-assets` |

`openspec sync-plan|sync-apply` 不进入任何 retained surface。`help`/`version` 的全局 flag 处理可以保持专用 parser，但必须在同一 metadata catalog 中拥有 identity、surface 和 canonical help，不能成为 catalog 外的不可验证例外。

### 3. 删除旧 handler，保留 `converge` 所需内部 primitive

删除 `openspec sync-plan` 与 `openspec sync-apply` descriptor、专属 CLI handler、公开 JSON schema identity和只保护旧 route 的测试。`createDeterministicSyncPlan`、`applyDeterministicSyncPlan` 等内部函数仍由 `openspec converge` 使用，不因删除 CLI surface 而复制或重写。

旧调用返回标准 unknown-command 诊断，并建议 `buildr openspec converge`。不保留隐藏 alias，否则仍然承担兼容 surface。

### 4. 验证关系而不是固定存量数量

架构验证不再硬编码 66 个 command key；改为检查：

- key 唯一、surface 属于封闭枚举；
- 每个 executable leaf 都有 canonical help；
- 每个声明 aggregate topic 都可查询；
- 根帮助的每一项来自 catalog，maintenance/legacy 不混入 primary；
- handler、help 和 unknown-command candidate 使用同一 key 集；
- 明确退役 route 不再出现在 catalog、help 或 public JSON schema。

具体命令行为继续由现有 focused integration/system tests 验证。

## Risks / Trade-offs

- [descriptor 内容增大，使 registry 文件过长] → 保持 descriptor 可按 domain 拆成静态数组后在 composition root 合并，但每个 executable command 仍只有一个完整 descriptor，不建立 keyed join。
- [重排根帮助影响已有文本快照] → 保留命令 spelling 和 canonical topic，只新增稳定分区；更新测试以验证语义分类而不是整段脆弱快照。
- [删除旧 route 影响未知外部调用] → 当前仓库已证明零 Skill/Component consumer，并在 changelog/CLI reference 明确 breaking replacement；不删除仍有消费者的 baseline/check。
- [surface 被误当作授权边界] → descriptor 和文档明确 surface 只控制 discoverability，effects/authorization 仍由 Application 决定。
- [为统一 metadata 顺带重构全部 CLI adapter] → 限制为 registry/help/verification 垂直切片，retained handler body 与领域 Application 不动。

## Migration Plan

1. 先引入 descriptor metadata 与 catalog validation，让现有 retained route 在新模型下行为等价。
2. 迁移 root、leaf、aggregate help 和 unknown-command candidates 到 catalog。
3. 更新验证，证明 catalog、dispatch、help 和分类一致。
4. 删除 `sync-plan`/`sync-apply` route、handler、schema 与旧测试，保留 `converge` 内部 primitive。
5. 更新 current knowledge、CLI Reference、架构说明和 changelog；运行 affected tests 与正式 Product delivery verification。

回滚时可整体回退本 Change；不涉及 workspace 数据迁移或持久化 schema。

## Open Questions

无。`baseline create`、阶段型 `check` 与 Project Skill migration 的最终退役时间由后续兼容性 Change 决定。
