# Buildr CLI Reference

本文列出 Buildr 0.1.x 的公开命令和稳定用途。以 `buildr <topic> --help` / `buildr help <topic>`、`buildr runtime list --json` 和 `buildr doctor --agent <agent> --json` 的当前输出为最终参数事实。

支持 `--json` 的命令在顶层输出 `schemaVersion`。该字段及兼容规则见 [公开 JSON 契约](json-contracts.md)；消费者应按 schema identity 判断格式，而不是依赖未声明的内部实现。

## CLI identity、帮助与错误

- `buildr --version`、`buildr -V` 和 `buildr version` 输出当前实际执行 package 的版本；`buildr version --json` 输出 `buildr.version/v1`。
- `buildr help <command...>` 与 `buildr <command...> --help` / `-h` 使用同一 canonical 帮助主题。
- 未知命令默认向 stderr 输出简洁错误、有限建议和 `buildr --help` 提示，并以 2 退出；携带 `--json` 时 stdout 只输出 `buildr.cli-error/v1`，stderr 为空。
- `-v` 不作为版本别名，为未来 verbose 语义保留；本 change 不提供 Shell completion。

## 首次使用

```bash
buildr app launcher install --channel release --json
buildr runtime list --json
buildr init --agent <claude-code|codex|cursor|qoder|trae|trae-work|workbuddy> --target <workspace> --name <name> --description <description> --profile <personal|team|company>
```

用户要求 Agent“安装 Buildr”时，默认先安装 npm CLI，再安装当前平台 release launcher，并分别验证。`buildr app launcher install|status|uninstall` 只管理指定 launcher channel；macOS 默认安装到 `/Applications`，Windows 默认安装到当前用户的 LocalAppData Programs，`development` channel 安装为隔离的 `Buildr Dev`。全局安装不写 Agent runtime Skill；`init --agent` 在目标 Workspace 首次投射 Buildr Skill，`sync`/`render` 负责后续收敛。

`init --agent` 是默认首次 onboarding 入口：它先初始化源资产，再复用完整 `sync` 执行 source update、产品 Buildr Skill 安装、workspace destination 投射和最终 doctor。`init`/`sync` 不隐式写用户级 Skills。

`buildr update` 只更新 CLI 自身：开发 checkout 使用 Git 安全更新，registry package 使用 npm 更新。它不接收 `--target`，也不读取 workspace。用户要求“更新 Buildr”或“同步 Buildr”时，Agent 在 update 成功后重新解析入口，再执行 `buildr skill install <agent> --target <workspace>`，更新 CLI 与产品入口 Buildr Skill，而不扩大为 workspace sync。用户要求“更新 workspace”或“同步 workspace”时，Agent 先判断 workspace root 是否由 Git 管理：Git workspace 解析 `buildr.git-workspace-update/v1` binding 并使用 selected provider 检查当前分支、upstream 和工作区状态，成功后执行 `buildr sync <agent> --target <workspace>`；非 Git workspace 直接 sync。required provider blocked 或 Git 决策点会阻止后续 sync，Agent 不自动 stash、rebase 或覆盖；该复合意图不先更新 CLI，且 Git 更新成功后不重复询问 sync。`buildr sync` 自身不隐式执行 Git 更新。

## Workspace 与资产

| 命令 | 用途 |
|---|---|
| `buildr init [--agent <agent>]` | 初始化 Organization/Root，写入当前受支持 CLI 的精确 Workspace Node version 并准备受管 runtime；传入 `--agent` 时一次完成 Agent runtime 与最终 doctor。 |
| `buildr app [--target <workspace>] [--no-open]` | 启动或复用只监听 `127.0.0.1` 的默认本机 Web 应用；默认打开浏览器，登记和切换多个 Workspace，`--target` 登记并打开指定 Workspace。 |
| `buildr app preview start|list|stop` | 启动、查看或停止隔离的开发预览。带 `--task <task-id> --target <canonical-workspace>` 时，Preview 使用 ready Task Environment 的任务验证工作区，健康后登记为动态资源，停止确认后释放；不带 Task 时保持独立 checkout preview。 |
| `buildr app launcher install/status/uninstall` | 安装、诊断或卸载 release/development launcher；使用新 staging 验证后切换，保留 Workspace Registry 和源资产。 |
| `buildr project create <code>` | 创建或登记 Project；`--name`/`--description` 设置 metadata，`--repo`、`--remote`、`--integration-branch` 声明独立 Git source，并补齐空 `commands.yml` requirement context。 |
| `buildr service create <project>/<service> <repo-ref>` | 接入本地目录或 Git Service；用 `--name`、`--description`、`--type` 描述 Domain，Git 来源可用 `--remote`、`--integration-branch` 声明稳定来源。 |
| `buildr task environment prepare\|inspect\|cleanup <task-id>` | 在 canonical Workspace 上准备或恢复、只读复核、清理正式 Task 的执行环境。`prepare` 确定性准备实际执行根、Runtime、CLI、依赖和 runtime projection；结果返回 current-machine probes 与明确 execution binding。Environment Receipt 独占 ready、恢复、动态资源和总 cleanup。 |
| `buildr worktree create\|inspect\|cleanup <task-id>` | 窄 Git worktree provider。`create` 接受 branch/start point 与显式 Project/Service selectors；`inspect` 复核 checkout/branch/HEAD/clean/registration；`cleanup` 要求每仓 integrated ref。它不判断 Environment ready，也不准备 Runtime、CLI、依赖、projection 或动态资源。 |
| `buildr verification run --project <code> --level affected\|candidate` | 使用 Workspace 受管 Node 执行 Project `verification.yml`。需要绑定正式环境时同时传 `--environment <task-id> --workspace <canonical-workspace>`；执行根必须属于该 Environment。返回 Candidate、Task checkout/CLI/projection、Workspace Node 与 checks identity 绑定的验证 evidence，不证明 Agent session，也不把 retained Buildr hash 当作 applicability 条件。 |
| `buildr task create\|inspect\|update\|complete\|abandon` | 在明确的 canonical Workspace 中维护 `.buildr/tasks/<task-id>/task.yml`。五个动作只管理 Task ID、标题、意图、Project/Service scope、0..N 个限定 Change、顶层状态和简短终态结果；不记录 Task Environment、研发、审查、验证、Git、Finish、Board 或复盘事实。`create` 要求显式 title/intent，`update` 只接受字段 setter 与引用 add/remove，`complete` 要求 summary 并以 `--no-change` 明确无变更完成，terminal Task 不可重开。全部动作支持 `--target` 和 `--json`。 |
| `buildr task finish run\|inspect` | 首次 `run` 明确接收 `--task <task-id> --project <code>`，并要求该 Task 的 Environment ready；`--change` 仅 Change 候选必需，省略时创建 code-only 候选。两类候选单次执行 `preflight → prepare → verify → deliver → cleanup`。Finish 读取 Environment execution result，交付完成后把 delivery identity 交给 Environment，并消费其 cleanup 结果；不直接清理 worktree 或动态资源。 |
| `buildr rules add/remove` | 维护 root Rules manifest 和文件生命周期。 |
| `buildr skills add/remove` | 只维护 workspace `skills/` 中的 Skill source；旧 `--scope .` 仅兼容并警告，Project scope 被拒绝。 |
| `buildr skills bind/unbind` | 维护 workspace 默认 binding，或在 `projects/<project>/capabilities.yml` 维护 Project context binding。 |
| `buildr skills render <agent> --destination workspace\|user` | 从 `--target <workspace>` 读取 source，显式投射到当前工作目录或个人用户层；默认 workspace。 |
| `buildr skills migrate-project-assets --check\|--apply` | 检查或事务迁移 legacy Project Skill source，冲突时零写入。 |
| `buildr commands add/remove` | 维护 workspace Command catalog definitions；最后一个 definition 仍被 requirement 引用时零写入。 |
| `buildr commands check [--project <project> ...]` | 按显式 Project task context 合并 requirements 并观察本机环境；无 Project 时只检查 workspace defaults。 |
| `buildr component list/check/install/uninstall` | 管理 workspace 级 Rules、Skills、Command collections 与声明式 Skill Contribution。 |
| `buildr builtin list/uninstall/restore` | 查看或维护 Buildr 内置能力；required 能力不能卸载。`restore` 表示明确放弃该 Builtin 的本地修改；replacement 只接管可证明为 Buildr-managed 的 predecessor，恢复 source 后再运行 `sync <agent>` 收敛 runtime。 |
| `buildr update [check]` | 检查或更新 Buildr CLI 自身；不维护 workspace。 |

新 Workspace 使用 `.buildr/workspace.yml` 的 `buildr.workspace/v1` schema，并与 `skills/manifest.yml.workspaceId` 共享同一 UUID。旧 metadata 可以在 `buildr app` 中只读查看；`buildr sync <agent>` 通过同一 source transaction 显式迁移两份 Manifest，identity 冲突时零写入失败。页面修改使用 revision compare-and-swap，不自动覆盖 Agent、Git 或编辑器已经产生的外部变化。

Task Record 使用 closed `buildr.task-record/v1` schema。Task ID、目录名和文件内 identity 必须一致；Project、Service 通过 Workspace registry 校验，新增 Change 引用通过 Task-scoped Change Reference Resolver 从 ready Task Environment Project root或 retained Project 解析。Change 不需要为适配校验而提前写入 retained Project。引用暂时不可用时 inspect/list 返回诊断，删除该引用或修改无关字段仍可继续。Task Record 不保存 Environment path、identity 或 provenance。Repository 只拥有并原子替换 `task.yml`；读取结果附带不持久化的 `recordDigest`，供 Local App 拒绝陈旧页面。

默认 App 的用户级登记文件只保存规范化 Workspace root 和最近使用项；Workspace 名称、说明、Project、Service 与全局 Change 列表始终从 retained Workspace 实时读取。Task 详情保留概览，并提供独立只读“环境”页签：打开、窗口聚焦或手动刷新时执行一次 current-machine probe，显示 observedAt、scope/root、Runtime/CLI/依赖/projection、provider evidence、动态资源与 cleanup 摘要，不提供 Environment mutation。Task 关联 Change 的详情通过同一 Task-scoped Resolver 读取候选与 retained baseline；全局 Change 列表仍保持 retained-only。

Project registry 使用 `buildr.projects/v2`：每个 Project 保存 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`。`source.path` 是文件系统物化位置；Git source 另外保存 URL、remote 和稳定的 `integrationBranch`。`currentBranch`、HEAD、dirty、upstream 与 ahead/behind 是实时观察状态，不写入 Domain。v1 registry 可只读查询，`buildr sync <agent>` 显式迁移；页面不会静默迁移、切分支、stash 或改写 remote。

`service create --integration-branch` 只适用于 Git 来源，`--branch` 仅为兼容别名。Canonical Service Domain 保存 UUID `id`、`workspaceId`、`projectId`、`code`、`name`、`description`、`type` 和 `source`；`source.path` 定位文件系统中的实际 Service，Git source 保存 URL、remote 与稳定 integration branch。当前分支、HEAD、dirty、upstream 与 ahead/behind 只实时观察，不写回 Domain。

Environment Receipt 固定保存在 canonical Workspace 的 `.buildr/tasks/<task-id>/environment.json`，使用 `buildr.task-environment-receipt/v2`。它记录实际 scope、Task checkout/provider evidence、执行根、任务验证工作区根、Receipt 创建时的 manager 指纹、Runtime/CLI/依赖/projection probes、已知动态资源以及最近 ready/cleanup 事实；不写入 Task Record，不保存凭证、任意 cleanup 命令或 Agent session。manager 指纹不决定 Task 源码版本、ready、资源 ownership 或 Verification applicability。共享执行根只允许一个未清理的重叠 Task 占用；同一 Task 的 `prepare` 复用原放置计划，不在恢复时静默切换 shared/Git，也不自动 fetch/rebase Task checkout。

Git provider evidence 使用 `buildr.git-worktree-evidence/v1`，保存在 Git common-dir 的 `buildr/task-worktrees/<task-id>.json`。它只包含 repository selector、source/checkout、branch/start point、HEAD、clean、registration、remote 和 Git effects。Environment cleanup 先停止已登记资源，再把每仓 delivery identity 交给 provider；明确 abandon 时可以清理可证明属于该 Task 的 dirty checkout。provider 不删除远端分支，也不执行交付、验证或总 cleanup 判断。

## Runtime 与诊断

| 命令 | 用途 |
|---|---|
| `buildr runtime list` | 查看 supported adapters、capabilities 和推荐命令。 |
| `buildr doctor` | 只读聚合 workspace、Workspace Node 声明/runtime/CLI/npm/验证环境、registries、Components 和 Commands；Node 缺失或漂移时建议运行 `sync`，不直接修复。 |
| `buildr render <agent>` | 组合投射 Rules entry 与 workspace Skills 到 workspace destination，不安装产品入口 Skill。 |
| `buildr sync <agent>` | 同步当前本地 workspace checkout 中的产品源能力、按既有精确声明恢复 Workspace Node runtime，并准备当前 Agent runtime。P0.2 cutover 时先执行一次性旧 Environment reader/migrator；任何 D 类 identity/ownership 冲突会在新写入前阻止该 Workspace 切换。 |
| `buildr runtime check <agent>` | 专项比较某个 scope 的 runtime 期望状态。 |
| `buildr skill install <agent>` | 只安装产品入口 Buildr Skill。 |
| `buildr mutation recover <id>` | 从完整 transaction journal/backup 恢复未完成 source mutation。 |

`doctor` 的 `ok` 为兼容字段，只表示没有 error，不表示 workspace 已无需处理。Agent 应同时读取 `health.workspaceValid`、`health.ready`、`health.actionRequired` 和 `repairPlan`：例如只有 actionable warning 时，结果可以是 `ok: true` 但 `ready: false`。canonical workspace identity 要求根 `AGENTS.md`、`.buildr/workspace.yml` 和 `projects/` 同时存在；只存在其中一部分时报告 `incomplete`，不会误判为已初始化。

默认 doctor 分三层声明诊断边界：`core` 每次检查 workspace identity、mutation recovery 和 root registries；`conditional` 只在相关 scope、资产或 selected Agent 适用时检查 Project/Service、Rules/Skills、package assets、Commands 与 runtime；`specialty` 是显式场景。对已声明的独立 Git Project，doctor 会比较 remote、`integrationBranch` 和本地实时状态，但不会执行 Git 修改；它不深检 OpenSpec active change，也不运行 build/test。需要更多细节时进入对应 Git、OpenSpec、验证工作流。

当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`。其他 runtime 不使用 fallback adapter；各 adapter 的文件路径、刷新方式和证据状态见 [Agent Runtime Adapters](agent-runtime-adapters.md)。

## Commands 三层模型

- workspace `commands/manifest.yml` 与 `commands/**/manifest.yml` 是唯一 catalog definition source，保存 `id`、`executable`、version probe 和最小 `installHint`。
- `projects/<project>/commands.yml` 使用 `buildr.project-commands/v1`，只保存 `id`、required/optional、可选版本约束和用途；它不复制 definition。
- `commands check` 的 `catalog`、`requirements`、`effectiveConstraints`、`observations` 和 `findings` 分别表达源定义、业务要求、合并结果、本机观察和诊断。重复 `--project` 表达跨 Project task context；不兼容版本约束在 probe 前以 `command_requirement_conflict` 失败。

Buildr 不 render 或安装 Commands，不保存 binary、token、cookie、登录态、license 或个人配置。machine warning 只说明当前环境与有效 requirement 的差异；安装、升级或登录仍需要用户单独授权。

## Project 测试能力声明

`projects/<project>/verification.yml` 使用 `buildr.project-verification/v1`，可选声明任意测试能力的 argv、cwd、成熟度、Minimal/Affected/Candidate 阶段、门禁强度、适用路径、覆盖、环境、副作用、授权和依赖关系。可选 `resources` 目录使用 `isolated`、`namespaced`、`coordinated`、`external` 表达 task-local、命名隔离、跨任务容量和外部授权边界，能力通过 `resourceClaims` 引用。它是 Project 测试事实，不是 `capabilities.yml` 中的 Skill binding，也不会被投射到 Service repo。

有有效声明时，`buildr verification run` 是 checkout 与 npm 安装后共享的正式执行入口。`affected` 选择该阶段 stable required 能力；`candidate` 保留完整 required gate；依赖失败会阻塞下游，只有显式 `supersedes` 才去重。单次 run 内独立能力并发，`coordinated` 资源在同一 Git common-dir 的 task runs 之间排队，`external` 资源必须显式授权。命令不创建任务、不调度 Agent，也不把 Buildr Product registry 当作其他 Project 默认值。

没有该文件时，doctor 不产生 finding，`task-verification` 继续从 AGENTS、POM、项目文档和已有测试入口发现政策。文件存在时 doctor 只做结构、路径和能力图校验，不运行命令或探测测试环境。用户通过 Agent 说“初始化测试声明”或“更新测试声明”即可生成/增量补充候选；新增能力默认 discovered 或 trial/advisory，不会自动成为 Candidate required gate。

## Skill capability contracts

`buildr.skills/v3` 为每个 workspace Skill 保存稳定 `assetIdentity`/`sourceIdentity`，并支持 versioned contract、provider `provides`、consumer `requires` 和 workspace 默认 binding。Project context 使用 `buildr.project-capabilities/v1`。安装 provider 本身不会静默改绑。

Contract 格式、scope 规则、替换示例以及 `ready` 的边界见 [Skill Capability Contracts](skill-capability-contracts.md)。

## Product maintenance / workflow internal

- `buildr package check/build`：产品 package 维护和构建，不是普通 workspace 日常命令。
- `buildr openspec converge <change> --project <project> --target <workspace> --json`：Buildr OpenSpec 单一收敛事务；内部完成规划、隔离 strict validation、条件式 canonical 应用、写后确认与 `archive --skip-specs`，结果为 `passed|blocked|recovery-unprovable`。
- `buildr openspec audit <change> --project <project> --target <workspace> --json`：只读比较唯一回执中的 before/expected 与当前实际摘要；不写 canonical、回执或归档。
- 历史 baseline、阶段 check、sync plan/apply 命令只在旧调用命中时执行并返回结构化弃用信息；新 Task Finish 和新 Change 不再消费或写入对应阶段 sidecar，达到零当前消费者与兼容窗口后删除。
- `buildr bootstrap guide`：产品 Skill 不可用时的纯文本兜底说明。

这些命令可执行，但不构成普通用户需要记忆的 public asset API。

## 内部实现边界

`bin/buildr.mjs` 是稳定 npm bin 路径，实际命令通过内部 `src/` runtime 和唯一 command registry 执行。该模块树随 tarball 发布以保证命令可运行，但不是公开 JavaScript API，不承诺文件级 import 兼容；维护约定见 [CLI 内部架构](cli-architecture.md)。

## 远端 Skill 请求

resolved `skill-url` 默认具有有限请求时间。维护者可设置：

- `BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS`
- `BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS`

值必须是 `1..120000` 的整数毫秒。生产环境建议为 resolved source 提供 `sha256-<hex>` integrity。
