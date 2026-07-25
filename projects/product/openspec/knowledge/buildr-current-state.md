# Buildr Current State

本文记录 Buildr 当前已经实现并验证成立的产品事实。产品解释见 [docs/buildr-product.md](../../docs/buildr-product.md)；规范性要求以 [openspec/specs](../specs/) 和 active change delta specs 为准。

## Workspace / Organization

当前默认层级模型为：

```text
Organization/Root -> Project -> Service
```

- `buildr init --agent <agent> --target <dir> --name <name> [--description <description>] --profile <profile>` 是推荐首次入口：将目标目录初始化为 Buildr root，并复用完整 sync 管线准备当前 Agent runtime 与最终 doctor；不带 `--agent` 时只初始化源资产。未提供 description 时写入明确 TODO，由 doctor 提示补全。
- Buildr root 是个人或组织的 Organization 上下文实例。
- `.buildr/workspace.yml` 使用 `buildr.workspace/v1`，记录稳定 UUID `id`、`name`、`description` 以及只读兼容 metadata；`skills/manifest.yml.workspaceId` 必须引用同一 UUID。
- `buildr app --target <workspace> [--port <port>]` 只监听 loopback，提供 Workspace 与 Project 查看、`name/description` 受控修改，以及新增 Workspace/Project 的可复制 Agent prompt。旧 metadata/registry 只读展示，页面启动不会静默迁移。
- `buildr sync <agent>` 在 source transaction 中显式迁移 legacy Workspace metadata；两处 identity 冲突、非法 schema 或迁移失败时 fail closed 并回滚。
- Project 路径为 `projects/<project>/`。
- Service 默认 repo 路径为 `projects/<project>/services/<service>/`。
- 共享、基础或平台服务通过普通 Project 表达，例如 `foundation` 或 `platform`。
- `organizations/<org>/` legacy multi-organization layout 不再作为产品主线或 scope 兼容路径；doctor 会报告该布局并提示迁移到 root-as-Organization 模型。
- task worktree 的 canonical 位置是当前 Buildr workspace 根 `.worktrees/<task-id>/`；Agent 创建或复用前必须说明 task id、路径和分支，且不得静默回退 `/tmp`。
- 预计进入实现、构建或测试的 OpenSpec change 在 propose 前先创建 task worktree；采用后 artifacts、实现和合并前候选验证只有该 worktree 一个写入位置。
- 未合并候选产品只验证临时 workspace 或 task worktree 自身，不更新主自举 workspace。完整验证绑定最终候选 Git tree；commit、相同 tree 集成、push 和 worktree 清理复用该结果，tree 改变后才在集成前重验受影响部分。
- 当前内置 `task-finish` workspace Skill 独占完整“收尾”意图：在当前轮次授权常规 OpenSpec 同步归档、相关校验、提交、必要的本地未推送 rebase、fast-forward 集成、目标分支 push 和本地 worktree/任务分支清理；高风险或语义不确定动作仍停止确认。
- `task-finish` 是 Buildr 自有收尾编排 Skill，不修改外部 `openspec-*` Skills；OpenSpec Component 已安装时，runtime renderer 向其稳定 slots 贡献 canonical sync 前的 pre-sync check 和 sync 后 archive 前的 post-sync check。Component 卸载后这些说明消失，通用 `task-finish` 仍保留其余职责。
- `task-finish` 在资产审查 finalize 前先对齐用户已确认目标和决策、change artifacts、最终实现、Git diff 与验证结果，再复用 OpenSpec contract sidebar 证明已记录契约一致性；任务确认完成后只触发 optional `buildr.task-asset-review/v3` provider finalize 并等待其 `no-observation`、`discarded` 或 `awaiting-human` 结果，不汇总信号、执行资格门禁或判断沉淀内容。provider 不可用或失败时降级继续。
- 实际自举 workspace 的 sync 是独立状态变更，执行后按 Buildr Core 运行 doctor，不作为相同 tree 的第二轮产品 E2E；CLI update 只更新当前 Product checkout 或 registry package，不读取 workspace。
- Agent 采用 OpenSpec workflow 时，必须在动作前说明 change id、change 路径和 create/explore/apply/sync/archive 动作。

## Project Registry

- root `projects/manifest.yml` 是 workspace 管理的 Project registry。
- `buildr project create <project>` 会创建或修复 Project baseline，并维护 `projects/manifest.yml`。
- canonical Project registry 使用 `buildr.projects/v2`，每个 Project 记录 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`；`source.path` 是当前文件系统物化位置。
- `source.type: git` 另外声明 URL、remote 与稳定的 `integrationBranch`。当前分支、HEAD、dirty、upstream、ahead/behind 和实际 remote URL 由 Git adapter 实时观察，不写回 Domain。
- `buildr.projects/v1` 只兼容读取；显式 `buildr update` / `buildr sync <agent>` 完成原子迁移。普通读取和 app 启动不写入，迁移前 Project 页面只读。
- 传入 `--repo <git-url>` 时，Buildr 将 Project 资产 repo clone 到 `projects/<project>/`。
- Buildr 当前不登记外部本地 Project 链接；Project 资产 materialize 到 `projects/<project>/`。
- `buildr update` / `buildr sync` 会从 `projects/` 目录事实补登记 Project；仅存在于 manifest、但目录缺失的 Project 不会被自动实体化，由 doctor 告警并等待明确的 `project create` 决策。
- Project Git 目录已存在时，`project create --repo` 会比较声明 remote 的实际 URL、命令 URL 和 Domain source identity；不一致时在任何 registry 或 Project baseline 写入前失败，不静默 relink。
- Project 页面展示声明与实时 Git 状态的偏移，但不会自动 checkout、stash、merge 或丢弃改动；`name`、`description` 修改使用 registry revision 防止覆盖外部变化，新增只生成交给 Agent 的指令。

## Service Registry

- `buildr service create <project>/<service> <repo-ref>` 当前支持本地路径和 Git URL。
- 本地路径必须存在；Buildr 会复制到 `projects/<project>/services/<service>/`，不记录外部来源路径。
- Git URL 默认 clone 到 Project 下 `services/<service>/`，未指定分支时使用远端 HEAD。
- Git URL 可通过 `--branch <branch>` 指定首次 checkout intent；manifest 使用 `repo.branch` 保存显式 intent，`repo.defaultBranch` 仍保存远端 HEAD，doctor 会报告当前 checkout 分支漂移。
- Project 级 `services/manifest.yml` 是 Service registry。
- Service registry entry metadata 记录 `title`、`description`、`type`、`path`、`repo.kind`、`repo.url`、`repo.remote`、`repo.defaultBranch` 和可选 `repo.branch`。
- service 目录内 `AGENTS.md` 是 service 自身规则资产，不通过 `services/manifest.yml` 的 `rules.source` 指针声明。
- service repo 是 Buildr root 管理的代码资产，不是 MVP 的独立 Agent runtime 入口。
- Service Git 目录已存在时，`service create` 只允许相同 origin 和 metadata identity 的幂等修复；来源冲突保持 metadata 与 Git boundary 零写入。
- `service create --rules <path>` 当前仅保留 deprecated warning compatibility no-op；CLI 不读取、验证、复制或持久化该路径。canonical Service 规则入口是 Service 目录中的 `AGENTS.md`。

## Package Baseline

- `package/manifest.yml` 是 Buildr 产品发布边界和 workspace/project baseline 映射契约。
- `package/README.md` 是维护说明，不作为发布或运行契约；`package/bootstrap/` 是 Buildr Skill 不可用时由 CLI 原位读取的恢复通道。
- `package/targets/workspace/` 只放由 manifest 显式映射进用户 workspace 或 Project 的源文件。
- `package/targets/runtime/` 只放直接安装到 Agent runtime 的产品交付源。
- `buildr init` 按 `workspaceDirectories` 和 `workspaceFiles` 生成 root baseline；可选 `--agent` 在此后复用现有 sync，不复制 update/render/doctor 实现。
- `buildr project create` 按 `projectDirectories` 和 `projectFiles` 生成 Project baseline。
- npm package 当前发布基线为 `0.1.0-rc.5`，使用 MIT License 且允许本地或 registry 打包安装；开发 checkout installer 会在依赖缺失时使用 lockfile 执行 `npm ci --omit=dev`。
- canonical Agent 首次路径为 `runtime list -> init --agent <agent>`；高层 init 已包含完整 sync 和最终 doctor。repository onboarding verifier 会在不含 `node_modules` 和 Agent runtime 的候选树中验证该单命令闭环，并独立读取 doctor JSON。
- root `AGENTS.md` 现在只作为规则入口，必须包含 Buildr required block 并引用 `rules/buildr/core.md`。
- 目标 workspace 已存在 root `AGENTS.md` 时，Buildr 只补齐或修复 Buildr required block，不覆盖用户正文，也不再写入 `AGENTS.workspace.md`。
- package baseline 不包含 Agent runtime 产物。
- Buildr 产品源位于 `projects/product/`；用户 workspace 和当前自举 workspace 中由 Buildr 管理的 Rule、Skill 和 runtime 文件是安装结果，只能由当前 Product checkout 的 sync 单向物化，不反向作为产品源维护。
- `buildr package build --out` 先在同级 staging 构建；输出目录必须不存在、为空，或包含有效 `.buildr-package-output.json` 且 live integrity 未变化。非空无 receipt、内容被修改和保护根路径均拒绝覆盖。

## Components

- workspace Component registry 位于 `components/manifest.yml`，schema 为 `buildr.components/v1`；已安装定义位于 `components/<source>/<id>/component.yml`，schema 为 `buildr.component/v1`。
- Component 当前只支持 workspace scope，可统一拥有 Rules、Skills、嵌套 Command collections 和声明式 Skill Contribution fragments；同一成员只能属于一个 enabled Component。
- installed definition 同时是上次成功物化的版本回执；Buildr 用 Old/Live/New integrity 三方比较保护用户修改，并在集合预检通过后写成员、最后更新 definition。
- `buildr component list/check/install/uninstall` 提供状态检查和生命周期闭环；install/uninstall 要求 `--agent`，完成源资产变更后 reconcile runtime 并运行最终 doctor。
- 普通 builtin、rules、skills 或 commands 命令不能单独维护 enabled Component 成员。
- OpenSpec 是首个默认启用的随包 Component，统一维护 `skills/openspec/` 下保持上游正文的外部 workflow Skills、Buildr 自有 `openspec-contract-guard` sidebar、Skill Contribution fragments 和 `commands/buildr/openspec/manifest.yml`；`skills/buildr/` 不保存 OpenSpec workflow fork。本机 OpenSpec CLI 只被声明和检查，Project `openspec/` 不属于该 Component。
- Sidebar 是 Buildr 对外部能力的独立、可卸载增强模式；`openspec-contract-guard` 是 OpenSpec sidebar 的能力主体，Contributions 是接入上游 actions 与 Buildr task workflows 的连接点。
- Skill Contribution 由 Component definition 声明目标 Skill、placement 和 fragment；Buildr 自有 Skill 可使用稳定 slot，外部 Skill 使用 prepend/append boundary composition。fragment 纳入 integrity，只在 enabled installed Component 的 runtime render 中组合，不修改 workspace Skill 源。可选目标 Skill未安装时跳过，无效 placement、缺失 slot 或 fragment integrity 不一致时 fail closed。
- Skill Contribution 是自然语言内容组合，不执行命令；当前不支持 Project/Service Component、远程 registry、依赖求解、权限或可执行 Hook。
- `buildr sync` 在创建 mutation lock、transaction 或 backup 前完成 Builtin 与 Component 的只读集合预检；optional Builtin 或 Component 冲突需要用户决策时保持 workspace 与 Git 状态不变。Component 集合预检复用真实 reconcile plan，通过后成员、Rules/Skills manifests、Component registry 和安装 definition 才进入统一 source transaction；中途失败回滚，definition 仍是最后成功物化回执。runtime reconcile 保持在 source commit 之后。

## Managed Data Integrity

- `.`、`..`、路径分隔符和控制字符不能作为 Buildr 资产 identity；普通 id 中的点只作为字符，不参与路径导航。
- Buildr 只删除经过 scope、ownership 和 symlink 验证的精确受管成员；workspace 根、Product 根、当前目录、home、文件系统根和 Rules/Skills/Commands/Components 等集合根受保护。该保护不阻止正常 Rule、Skill、Builtin 或 Component 卸载。
- manifest 和 OpenSpec contract sidecar 使用 atomic writer；Buildr YAML 由成熟 parser 按真实 YAML 语义读取，再执行封闭 schema 校验和 canonical render。
- workspace source mutation 使用 `.buildr/mutations/` 保存单写者 lock、journal、staging 和 backup。sync transaction 只 snapshot plan 声明的精确受管文件、成员和原本缺失的目录，不把整个 `projects/`、已有 Project/Services 根或独立 Service repo 根纳入递归恢复。普通失败通过有限删除重试和恢复结果校验恢复操作前状态；异常残留阻塞后续 source mutation。
- init/sync 幂等确保 root `.gitignore` 包含 `/.buildr/mutations/`，避免事务临时状态进入 Git 变更视图，但不忽略 `.buildr/workspace.yml`。
- doctor 使用 `mutation.transaction_incomplete` 或 `mutation.lock_orphaned` 报告 operation、phase、affected paths 和 next action；可证明 journal 完整时使用 `buildr mutation recover <transaction-id> --target <workspace>` 恢复旧状态。失败 recover 保留完整材料并可再次执行；成功后写入轻量 recovery receipt，同一 transaction ID 再次 recover 是不修改 workspace 的成功 no-op。
- runtime 仍是可重建结果：source transaction 成功后 runtime reconcile 失败不会回滚源资产，而是返回失败并要求 render、sync 或 doctor 修复。

## Builtins / Rules

- Buildr 内置能力由 `package/manifest.yml` 的 `builtins` 声明。
- 内置 Rules 发布到 `rules/buildr/`，其中 `rules/buildr/core.md` 是唯一 required Rule。
- `rules/manifest.yml` 是规则事实清单；entry 包含 `id`、`source`、`path`、`description`、`enabled`、`required` 和 `state`。
- `rules/buildr/core.md` 规定 Rule 控制 Agent 的价值观、边界和约束；场景化流程和经验优先下沉为 Skill。
- runtime adapter 只发现和投射 Rule 源，不通过 role/path 路由替 Agent 判断语义相关性；required enabled installed Rule 必须读取，optional enabled installed Rule 先检查 description 并在任务相关时读取，disabled 或 uninstalled Rule 不参与任务。
- `buildr rules add <id>` 注册已存在的 root `rules/<id>.md` 或 `--path` 指定的规则文件到 `rules/manifest.yml`；description 是 Agent 判断规则语义相关性的索引。
- `buildr rules remove <id>` 删除 root 规则文件和 manifest entry；`--keep-file` 只取消注册并保留文件，后续由 doctor 报告为未登记规则文件。
- `runtime.md` 不再作为独立内置规则文件；runtime 边界已经内化进 core。
- 当前随包不发布 optional 内置 Rules；任务分流、worktree 生命周期和 Git 协作策略通过内置 workspace Skills 承载。
- `buildr update` 会恢复 required core 和 required block；optional 内置项已卸载时不自动还原，已修改或缺失时保留状态并提示用户决策。

## Agent Skills

- Buildr 产品内置 Agent Skill 位于 `package/targets/runtime/skills/buildr/SKILL.md`，由 `package/manifest.yml` 的 `agentSkills` 声明。
- `buildr runtime list --json` 输出 supported Agent runtime adapter、五类 required render capabilities、Rules/Skills/surface/activation/checker trait catalog、各 adapter 组合 traits、render 能力和推荐命令。
- 当前 supported Agent runtime adapter 是 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`，Agent id 大小写敏感；不为 unsupported runtime 使用 alias 或 fallback。
- `buildr skill install <agent> --target <dir>` 只安装产品入口 Buildr Skill。
- 该安装不要求目标目录已经是 Buildr workspace。
- 产品内置 Agent Skill 不复制到用户 workspace `skills/` 作为源资产。
- `package/bootstrap/guide.md` 是 Buildr Skill 不可用、未安装或损坏时的兜底入口。
- `package/bootstrap/contract.yml` 校验 Buildr Skill、bootstrap guide 和生成后 runtime Skill 的入口不回退。

## Workspace Skills 与 Project capability context

- Workspace 等同于工作目录，是 Skill 唯一 source authority；`buildr.skills/v3` 在根 `skills/manifest.yml` 保存 workspaceId、assetIdentity、sourceIdentity、contracts、默认 bindings 和全部 Skill entries。
- Project 不保存 Skill content。固定 `projects/<project>/capabilities.yml` 使用 `buildr.project-capabilities/v1` 表达 requirements、Project bindings 和 workspace Skill applicability；legacy Project manifests 只由 `skills migrate-project-assets --check/--apply` 显式事务迁移。
- 本地作者型 Skill 使用 `path` 指向完整 Skill 源目录，目录至少包含 `SKILL.md`。
- 远端发布型 Skill 可先用 `source` 登记信息源，再用 `resolved` 登记已解析安装源。
- `skills add --source <skill-dir>` 装载或登记完整本地 Skill 源目录。
- `skills add <id> --remote-source <url>` 登记远端信息源，不复制源目录。
- `skills add <id> --resolved-source <url>` 登记 Agent 已解析出的精确安装源。
- resolved `skill-url` 使用有界网络读取；默认 inactivity 和总 timeout 可通过 `BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS`、`BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS` 在 `1..120000` 毫秒内调整，超时保持 runtime 目标零写入。
- `package:<id>` 是 package manifest `skillSources` 与随包 Skill resolver 使用的内部 source identity，不是用户 Skill asset id、通用 source scheme 或 `skills add` 输入格式。
- Buildr 内置 workspace Skills 现在发布到 `skills/buildr/<skill-id>/`，并在 `skills/manifest.yml` 中以 `source: buildr`、`path`、`runtimePath`、`enabled`、`required` 和 `state` 管理。
- 当前随包独立 workspace Skills 包括 `task-triage`、`task-board`、`task-asset-review`、`task-worktree`、`task-finish` 和 `git-ops`；OpenSpec workflows 与 `openspec-contract-guard` 由 OpenSpec Component 统一交付，但仍以 Buildr builtin descriptor 提供产品元数据。
- `task-board` 为复杂、长期、跨批次或有交叉依赖的任务维护 Agent 单向更新、用户只读的单文件 HTML 任务看板。新页面默认路径为 Project `openspec/knowledge/task-boards/yyyy-MM-dd-<task-id>.html`，每个看板至少关联一个真实 OpenSpec change，并可跨多个 active/archive change、code-only 工作和外部依赖。旧称“任务驾驶舱”只保留为用户意图兼容；既有 `task-cockpits/` HTML 保持原路径和原内容，不参与升级迁移。
- `task-asset-review` 是 `buildr.task-asset-review/v3` 默认 provider：在非简单 Workspace 任务期间把精炼资产信号写入 canonical Workspace 的 untracked `.buildr/asset-review/inbox/`，主 checkout 与 linked task worktree 共享 inbox、不同物理 checkout 隔离、每个任务独立 owner 文件，并安全迁移 identity 匹配且无冲突的 v2 用户级草稿；结束时由 provider 核验覆盖并只分类为 Rule、Skill、capability Contract 或 product follow-up。没有候选时直接 discard；其余候选等待人工 accept/reject，accept 进入 identity 不同的新 task-triage，并以类型化 completion evidence 才能删除 observation。只有新任务真实修改前三类资产时，才在 `asset-maintenance/<type>/<asset-id>/records/` 随资产变更提交维护记录；product follow-up 由 OpenSpec 吸收来源，不复制历史。该能力不保存完整轨迹、不引入 Hook/daemon/数据库，也不创建 `asset.yml`。
- 任务看板优先展示普通用户可理解的目标、当前结论、当前批次、已完成、下一步和阻塞，再逐层展示 change 关联、交付批次、依赖池、业务/技术方案与已完成复杂任务的技术细节。它是 task-scoped working knowledge，不替代 canonical specs、active change、代码和验证证据。
- `task-triage` 判断驾驶舱是“不需要”“创建”还是“继续维护”；驾驶舱首次创建、实质更新、用户询问进度、任务暂停或完成时，Agent 回复提供可点击绝对路径和 workspace 相对路径。
- 产品入口 Buildr Skill 仍位于 `package/targets/runtime/skills/buildr/SKILL.md`，不进入 workspace `skills/manifest.yml`，也不硬编码可卸载 Component 所拥有的专用 Skill 路由。
- `buildr skills render <agent> --destination workspace|user --target <workspace>` 从同一 workspace authority 投射 Skills 和 install plans；默认 workspace，`init`/`sync` 不隐式写 user destination。
- adapter descriptor 声明两种 destination roots、可观测 discovery roots、inventory evidence 和 activation。Buildr 用 v2 receipt、source/render digest 和有效 inventory 分类幂等、更新、user satisfaction、外部等价、foreign owner 与 name conflict；blocking conflict 整次零写入，`--replace` 不自动 adopt/transfer。

## Commands

- 命令行工具清单是 root 级资产，默认 collection 位于 `commands/manifest.yml`，并安全递归发现 `commands/**/manifest.yml`。
- `buildr commands add/remove` 默认维护根 collection，`--collection` 定位嵌套 collection；Component-owned collection 拒绝普通维护。
- `buildr commands check` 聚合全部 collections；相同 id 的完全相同声明合并并保留来源，有效字段冲突时报告 error。
- 清单条目使用 `purpose` 表达组织期望用途，使用 `description` 表达补充背景，使用 `installHint` 表达安装提示。
- 清单支持 `source`、`enabled`、`required` 和 `state`，用于与 Buildr 内置 Command 声明共用 manifest。
- Buildr 不提供命令行工具 render 或 install。
- Buildr 检查组织期望能力和本机状态差异，不接管个人机器安装。

## Doctor

`buildr doctor` 当前提供：

- `buildr doctor --json`：Agent-readable 结构化诊断。
- `buildr doctor --agent <agent> --json`：按当前 Agent runtime 过滤 runtime diagnostics。
- `buildr doctor`：人类可读诊断报告。

Agent-facing Buildr onboarding 和维护流程当前要求先用 `buildr runtime list --json` 确认 adapter，再优先使用 `buildr doctor --agent <agent> --json` 建立事实基线；未传 `--agent` 的 doctor 只按 Buildr managed marker/receipt 发现并诊断 present runtime inventory，未选中 runtime drift 不影响通用 workspace readiness，也不作为当前 Agent 主流程。

尚未初始化的 workspace 例外：adapter 确认后直接运行 `buildr init --agent <agent>`，并使用该命令内置的最终 doctor 结果，不重复运行独立 sync 或 doctor。

当前诊断覆盖：

- workspace 是否初始化。
- root-as-Organization metadata 和 Project registry 状态。
- Project baseline、OpenSpec 骨架、`services/manifest.yml` 和 `services/` 状态。
- Service registry 与 repo 状态。
- Git service repo remote 与 Service registry metadata 的一致性。
- 嵌套 Project/Service Git repo 是否被最近上级 Git repo 的 `.gitignore` 忽略。
- 命令行工具清单与本机命令状态。
- Component registry、definition、成员 integrity、唯一 ownership 和期望状态。
- root `AGENTS.md` required block 状态。
- `rules/manifest.yml` 结构、登记文件缺失、未登记规则文件和 `description`。
- Claude Code runtime 是否缺失、过期或冲突。
- Codex runtime 是否缺失、过期或冲突。
- unsupported Agent runtime warning；该场景不运行具体 adapter checker，不生成 `.buildr/skills/buildr/SKILL.md` 或其他 bootstrap 导出文件。

## Runtime Render

- `AGENTS.md` 是 Buildr 标准规则资产。
- Rules scope 是真实 workspace 相对路径，支持 `.`、Project、Service 和任意深层目录；旧 `projects/<project>/<service>` 仅在 registry 可无歧义解析时兼容并给出 canonical warning。
- Rules discovery 合并 scope 祖先链与 scope 子树中的 `AGENTS.md`，去重后按宽到窄稳定排序；扫描不跟随目录符号链接，并跳过 `.worktrees`、VCS、Agent runtime、依赖、build output 和未登记嵌套 Git repo。
- Agent runtime 文件是可重建渲染产物，不是长期资产源。
- `service create` 不向 service repo 写入 `CLAUDE.md`、`.claude/` 或其他 runtime 文件。
- adapter required render capabilities 固定为 `rules-entry`、`product-buildr-skill`、`workspace-project-skills`、`skill-install-plans` 和 `runtime-check`。
- supported adapter descriptor 由受约束 traits 组合：Rules 为 `native-recursive`、`native-root`、`reference-bridge` 或 `vendor-rule-files`，Skills 为 `agents-compatible` 或 `vendor-root`，并可声明受约束的可选 Skill publication extensions；descriptor 还须显式声明 surface、activation 和 checker。组合不完整、extension path/format 非法或部分 Rules scope 不得注册为 supported。
- Codex 当前原生使用全部已发现的 `AGENTS.md`，Rules render 零写入；Codex Skills adapter 将 enabled Skills 的完整受支持目录渲染到 `.agents/skills/<skill-id>/`。
- 本地作者型和 package Skill 会投射 `SKILL.md` 以及 `agents/`、`assets/`、`examples/`、`references/`、`scripts/`、`templates/` 下的普通文件；`SKILL.md` 继续派生 managed marker、contributions、capability bindings 和 adapter context，随附文件保持原始字节与 owner executable 状态。`resolved.kind: skill-url` 仍是单文件 `SKILL.md` 来源。
- Skill 可移植核心和 Codex 发布都只要求有效 `SKILL.md`，其 `name` 与 `description` 用于发现和路由；随附目录均为可选。Codex/OpenAI profile 只在 `agents/openai.yaml` 已存在时校验该 UI extension，缺失不阻塞、不生成、不反写；其他 adapter 只在完整目录投射中保留已有文件而不消费。Skill 执行资源相对于当前 runtime `SKILL.md` 所在目录解析。
- 每个 adapter 在自身 runtime metadata 区维护版本化 Skill projection receipt。render、sync、runtime check、doctor 和 Component lifecycle 复用相同 inventory；active stale 与 orphan 只在文件仍匹配旧 receipt 时清理，已修改文件或未知用户文件触发零部分写入 conflict。缺少 receipt 的旧版仅 `SKILL.md` 投射继续保守兼容。
- Claude Code adapter 支持 `skill install`、`runtime check`、`rules render` 和 `skills render`。
- Cursor、Qoder、TRAE 使用 `vendor-rule-files`：分别生成各 source scope 的 `.cursor/rules/buildr.mdc`、root `.qoder/rules/buildr/*.md`、各 source scope 的 `.trae/rules/buildr.md`；TRAE Work 与 WorkBuddy 使用 root-index reference bridge，目标分别为 `CLAUDE.local.md` 和 `CODEBUDDY.md`。
- 新增 adapter 保留 Rules/Skills 的官方资料、安装包源码或本机 intake provenance，并由自动 contract/parity 验证 Buildr 的投射和维护边界。Descriptor 不维护 `documented`/`verified`、`pending`/`passed` 或品牌历史 marker smoke；TRAE Work checker 只报告 projection、environment probe 和 activation guidance，不把产品级真实 Agent 验证缺口作为当前 workspace prerequisite。
- Claude Code rules render 在每个 source 同目录生成 `@AGENTS.md` reference bridge，不复制规则全文；reconcile 先校验全部 conflict 再写入，并清理 source 已删除的 Buildr-managed orphan bridge。
- reference bridge 中旧 hash 过期只作为 metadata info，不构成 action-required stale。
- 当前实现已通过全部 supported adapters 的完整 Skill 目录投射契约与 parity 验证；Agent 产品是否在当前 session 发现新 Skill 仍以对应产品版本和 activation 行为为准。

## CLI Update / Workspace Sync / Builtin

- `buildr update` 根据 executable 来源更新 Buildr CLI 自身：开发 checkout 使用 Git fetch 与安全 fast-forward/rebase，registry package 使用 npm 更新同一 package identity；它不接收 workspace target，不执行 sync、render 或 doctor。
- `buildr update check --json` 输出 mode、current、available、status、blockingReasons 和 nextActions；development checkout 还分别报告 Git `sourceStatus` 与 registry `versionStatus`，upstream 一致但 package version 落后于对应发布渠道时报告 `version-stale` 且不自动修改 checkout。来源无法证明、Git dirty/shared/conflict 或 registry/prefix 受阻时 fail closed。
- `buildr builtin list --target <dir> --json` 查看内置能力状态。
- `buildr builtin uninstall <id> --target <dir>` 卸载 optional 内置能力；required 能力会被拒绝。
- 当前随包 optional Skills 卸载会删除源文件；各 supported adapter 下一次全量 render/sync 根据 projection receipt 安全删除完整 runtime Skill，遇到已修改受管文件或未知用户文件时保留现场并报告 conflict。
- `buildr builtin restore <id> --target <dir>` 从当前产品包恢复指定内置能力。
- `buildr sync <agent> --target <dir>` 是七个 supported adapter 的 workspace 同步主路径：同步 Buildr 产品能力、安装产品入口 Buildr Skill、准备当前 Agent 的 workspace 入口 runtime，并用 `doctor --agent <agent>` 复查；它不更新 CLI。
- 默认 `sync` 从 canonical `.` 递归 reconcile 整个受管理 workspace Rules 子树；组合 `render` 的 Rules 使用完整 canonical scope，Skills scope 折叠到所属 Root/Project。

## CLI Internal Architecture

- npm bin `bin/buildr.mjs` 是薄 executable，只负责 bootstrap 与顶层错误处理；help 和唯一命令登记位于 `src/interfaces/cli/`。
- `src/` 按 Domain、Application、Infrastructure、Interfaces 单向分层。Workspace 与 Project 已拥有纯 Domain：实体与字段约束位于 `src/domain/<domain>`，用例位于 `src/application/<domain>`，Manifest repository 与 Git observation 位于 Infrastructure，CLI/HTTP/Web 位于 Interfaces；Service 尚未抽取纯 Domain。
- `packageCheck` 的静态发布校验、临时 workspace smoke runner 和 composition handler 已分离，但 `buildr package check` 的统一输出和失败语义不变。
- npm tarball 递归包含 `src/` runtime dependency closure，内部模块不通过 package `exports` 暴露，也不是稳定 public JavaScript API。
- 产品验证通过 architecture、compatibility、checkout/npm package parity 和递归 managed mutation verifiers 保护薄入口、command 唯一登记、依赖方向、发布完整性、行为兼容和直接写入边界。

## Current CLI Surface

当前可执行命令按产品表面分类如下。分类是 help/docs 中的用途事实，不是权限或安全限制；maintenance/workflow 命令仍可执行并可查看主题帮助。

CLI identity 可通过 `buildr --version`、`buildr -V`、`buildr version` 或 `buildr version --json` 读取，事实来自当前实际执行 package metadata。`buildr help <command...>` 与 flag help 共用 canonical topic；未知路由使用简洁 stderr diagnostics，或在请求 `--json` 时输出 `buildr.cli-error/v1` 单对象并以 2 退出。`-v` 和 Shell completion 当前不属于公开版本入口。

| 分类 | 命令 |
|---|---|
| public onboarding / daily | `buildr init --agent <agent>`、纯源资产 `buildr init`、`buildr app`、`buildr project create`、`buildr service create`、`buildr doctor`、`buildr runtime list`、`buildr sync <agent>` |
| public CLI lifecycle | `buildr version`、`buildr update/check` |
| public asset lifecycle | `buildr commands add/remove/check`、`buildr component list/check/install/uninstall`、`buildr rules add/remove`、`buildr skills add/remove`、`buildr builtin list/uninstall/restore` |
| public advanced / repair | `buildr mutation recover`、`buildr runtime check <agent>`、`buildr render <agent>`、`buildr rules render <agent>`（仅 Rules writesFiles adapters）、`buildr skills render <agent>`、`buildr skill install <agent>`、`buildr bootstrap guide` |
| internal workflow | `buildr openspec baseline create`、`buildr openspec check` |
| internal product maintenance | `buildr package check`、`buildr package build` |

当前 legacy compatibility/preserved data 包括：`service create --rules` warning no-op、无 `--agent` doctor、无歧义旧 Service scope shorthand、`projects.yml`、Project `services.yml` 和遗留 `practices/`。canonical help、bootstrap、doctor repair command 和当前示例不生成这些旧形式。`organizations/<org>/` layout/scope 是明确拒绝的 unsupported input，不属于 legacy compatibility。

## Verification

当前产品验证入口包括：

- `cd projects/product && npm run test:unit`（同进程直接 unit owner）
- `cd projects/product && npm run test:contract`（源码、manifest、docs、Skills 与 entrypoint 静态契约）
- `cd projects/product && npm run test:integration:fast`（真实 CLI/Git 子进程的低成本集成）
- `cd projects/product && npm run coverage:unit -- --summary <path>`（独立 unit-only coverage 观测，不作为当前全局发布阈值）
- `cd projects/product && npm run test:changed -- --plan`（根据 Git diff 生成最小可解释 DAG）
- `cd projects/product && npm run test:focus -- <step-id|group:<group>>`（统一定点重跑入口，不自动附加 Fast）
- `projects/product/buildr package check`
- `projects/product/services/buildr/test/verification/onboarding/repository.mjs`
- `projects/product/services/buildr/test/verification/onboarding/init.mjs`
- `projects/product/services/buildr/test/verification/onboarding/service-branch.mjs`
- `projects/product/services/buildr/test/verification/network/remote-text.mjs`
- `projects/product/services/buildr/test/verification/cli/architecture.mjs`
- `projects/product/services/buildr/test/verification/cli/compatibility.mjs`
- `projects/product/services/buildr/test/verification/cli/package-parity.mjs`
- `cd projects/product && npm run test:focus -- workspace-lifecycle ownership-recovery runtime-reconciliation`（按稳定 step id 重跑 Workspace E2E；完整 Candidate 强制运行全部 suites）
- `projects/product/services/buildr/test/verification/openspec/contract.mjs`
- `projects/product/services/buildr/test/verification/openspec/contract-audit.mjs`
- `projects/product/services/buildr/test/verification/release/open-source-candidate.mjs`
- `(cd projects/product && openspec validate --all --strict)`
- `npm pack --dry-run`

`projects/product/services/buildr/scripts/verify-buildr-product` 聚合以上产品级门禁并包含 docs quality；验证编排显式从 Product Project root 读取 OpenSpec，从 Buildr Service root 执行 package、源码和测试。repository verifier 从无依赖、无 runtime 的临时候选树验证开发 CLI 安装和 update source，release smoke 从 tarball 安装后的 `buildr` 执行完整 init、sync、doctor、optional uninstall 生命周期。

开源候选 verifier 会检查 tracked candidate 的敏感模式、内部来源、占位 URL、异常大文件、中文/英文 README canonical token、公开 package metadata 和 npm tarball 禁止路径。产品完整验证会记录该阶段耗时，Buildr Product Project 的完成报告需说明总耗时、最慢阶段、失败阶段（如有）和 timing summary 路径。

## Open-source Release Preparation

- 官方公开源码 identity 是 `https://github.com/elevenching/Buildr`，中文 `README.md` 是 canonical 产品入口，`README.en.md` 是唯一要求维护的英文翻译；其他文档继续按 Project 管理语言维护。
- 官方 npm package identity 是 `@buildr-ai/buildr`，executable 仍是 `buildr`。prerelease 映射 `next`，稳定版本映射 `latest`，release tag 必须与 package version 一致。
- Buildr Product Project 发布任务从准备时最新 `origin/dev` 记录 immutable candidate base，再从目标 package version 派生 `release-<version>` task id、`tasks/release-<version>` 分支和 canonical worktree；新建 worktree 先运行 Product Project `npm ci`。版本和发布材料必须先 fast-forward 回 dev；需要排除 dev 内容时先独立撤销，不能从旧 ancestor 发布。pre-main/post-main convergence checker验证 base、version、main/dev tree、ancestry 与 release task hygiene 后，才允许 PR、history bridge 和 tag；该特例不扩展通用 Git Ops/Task Finish 授权。
- `.github/workflows/publish.yml` 使用 GitHub-hosted Node、`npm-production` Environment 和 OIDC 权限准备受控发布；第一阶段不自动 push 公开 GitHub、不创建 tag、不执行首次 npm publish。

## Current Limits

- runtime adapter 当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`；其他 Agent 不支持自动渲染，应联系 Buildr 作者反馈。
- Codex 使用 `AGENTS.md` 和 `.agents/skills/`；不生成 managed `AGENTS.md` runtime 文件。
- service repo 不作为 MVP 的独立 Agent runtime 入口。
- Project 级 `rules/manifest.yml` 当前不提供；Project 规则仍通过 `projects/<project>/AGENTS.md` 维护。
- 当前不提供命令行工具 install/render；Component 不安装、升级或卸载外部 CLI。
- Component 当前仅支持 workspace scope；Project/Service Component、远程 registry、依赖求解、权限系统、系统级 Hook 和其他 Agent adapters 仍是后续能力。
- `buildr openspec baseline create <change> --project <project> --target <workspace>` 在 active change sidecar 中记录 Requirement 基线；`buildr openspec check` 提供 proposal、pre-sync 和 post-sync stages。缺少/不完整基线、active change 同 Requirement 冲突、stale canonical Requirement、delta/receipt 改变或同步修改未触达 Requirement 都会返回非零状态和 Agent-readable nextActions；它不修改外部 OpenSpec CLI 或 Skills。
