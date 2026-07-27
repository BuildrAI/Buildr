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
| `buildr init [--agent <agent>]` | 初始化 Organization/Root；传入 `--agent` 时一次完成 runtime 与最终 doctor，不传时只写源资产。 |
| `buildr app [--target <workspace>] [--no-open]` | 启动或复用只监听 `127.0.0.1` 的默认本机 Web 应用；默认打开浏览器，登记和切换多个 Workspace，`--target` 登记并打开指定 Workspace。 |
| `buildr app preview start|list|stop` | Agent 为 task environment 启动、查看或停止隔离的开发预览；owner 绑定 task id、environment root、Product checkout 和 repository set，不替换默认应用或 `Buildr Dev.app`。 |
| `buildr app launcher install/status/uninstall` | 安装、诊断或卸载 release/development launcher；使用新 staging 验证后切换，保留 Workspace Registry 和源资产。 |
| `buildr project create <code>` | 创建或登记 Project；`--name`/`--description` 设置 metadata，`--repo`、`--remote`、`--integration-branch` 声明独立 Git source，并补齐空 `commands.yml` requirement context。 |
| `buildr service create <project>/<service> <repo-ref>` | 接入本地目录或 Git Service；用 `--name`、`--description`、`--type` 描述 Domain，Git 来源可用 `--remote`、`--integration-branch` 声明稳定来源。 |
| `buildr worktree create <task-id> --agent <agent> --branch <branch> [--include ...]` | 创建或幂等复用 `<workspace>/.worktrees/<task-id>`；默认根仓库，重复 `--include project:<code>` / `service:<project>/<service>` 加入 nested independent Git repositories；返回与 receipt 绑定的绝对 `cliInvocation`。 |
| `buildr worktree inspect/context/adopt` | 按 receipt 检查完整 repository set、CLI source/invocation 和 runtime identity；`context` 返回绝对 command 与固定 args prefix，调用方不根据 cwd 或产品相对位置拼入口。专项 runtime 机制验收才使用 host-visible session adoption evidence；任一绑定不匹配时 fail closed。 |
| `buildr task finish actions/inspect/advance/resume/run/recover` | `actions`查询版本化action registry与当前resolution；`run`默认从registry生成确定性计划和fingerprint，标准语义步骤返回provider handoff，只有未覆盖、歧义或登记外分支返回Agent reasoning fallback。OpenSpec `post-sync` 后 delta 再变化时，`contract-convergence` 会核验旧 receipt/baseline/sync plan/canonical/executable 证明链并自动恢复、重建基线和重新收敛；语义漂移返回 `semantic-resolution-required`，证明缺失返回 `recovery-unprovable`，均不静默改写。integration-push 后的 `retained-convergence` 消费 retained Workspace、绝对 CLI invocation、Agent 与完整 changed paths，始终执行最终 doctor，只在 runtime 资产受影响时 sync；CLI/Local App impact 只交给后续安装 provider，不重复 Candidate。显式plans仅作兼容或恢复。formal assurance失败默认返回identity-bound repair decision并停止；仅当`recover --repair-authorization <json>`明确绑定task/change、failure identity与allowed scopes时，才消费版本化before/after identities与transition proof继续re-verification。 |
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

默认 App 的用户级登记文件只保存规范化 Workspace root 和最近使用项；Workspace 名称、说明、Project、Service 与 Change 始终从各 Workspace 实时读取。Registry 为空时页面引导选择已有 Workspace、生成新建 Agent Action 或稍后处理，不自动扫描磁盘。关闭浏览器标签页不会停止本机服务，页面“退出 Buildr”会安全停止实例但保留登记列表和全部源资产。task worktree 的并发验收使用 `buildr app preview`：每个显式实例名拥有独立的状态目录、登记列表、启动锁和随机 loopback URL，并展示 worktree、分支、HEAD 与 dirty 身份。preview 直接运行请求 worktree 的 checkout，不安装或替换 `Buildr Dev.app`。macOS `Buildr.app` 与 Windows launcher bundle 携带运行所需的 Node runtime 和 Web 资源，只负责启动或复用默认随机 loopback 端口上的服务并打开默认浏览器，不提供 Desktop WebView。

Project registry 使用 `buildr.projects/v2`：每个 Project 保存 UUID `id`、所属 `workspaceId`、可读 `code`、`name`、`description` 和 `source`。`source.path` 是文件系统物化位置；Git source 另外保存 URL、remote 和稳定的 `integrationBranch`。`currentBranch`、HEAD、dirty、upstream 与 ahead/behind 是实时观察状态，不写入 Domain。v1 registry 可只读查询，`buildr sync <agent>` 显式迁移；页面不会静默迁移、切分支、stash 或改写 remote。

`service create --integration-branch` 只适用于 Git 来源，`--branch` 仅为兼容别名。Canonical Service Domain 保存 UUID `id`、`workspaceId`、`projectId`、`code`、`name`、`description`、`type` 和 `source`；`source.path` 定位文件系统中的实际 Service，Git source 保存 URL、remote 与稳定 integration branch。当前分支、HEAD、dirty、upstream 与 ahead/behind 只实时观察，不写回 Domain。

`worktree create` 要求 Agent 显式提供 task id、task branch、root start point、当前 Agent、workspace root 和完整 repository selectors。`buildr.worktree-create/v2` 返回 environment、repository plan、逐仓 identity/state、runtime expectation、`handoff-required`、隔离披露和兼容的 root `worktree`/bootstrap 字段；相同 plan 幂等复用，不同 plan、occupied/tracked path、remote/branch ownership 或 identity 冲突均 fail closed。新 session 使用 `worktree adopt` 提交 session root/handle、adoption mode 与 event time；Buildr 将 environment evidence 标为 `buildr-verified`，将 host 声明标为 `agent-attested`。随后只有带同一 session evidence 的 `worktree context` 返回 `executionReady: true` 才能进入实现。部分创建失败保留 receipt、checkout 和分支。Git working tree/index 被隔离，但 objects/refs 共享。外部依赖沿用 Project 既有环境；只有并发任务会修改同一共享状态时，才要求使用项目已有租户、测试账号、数据前缀或串行验证边界。

## Runtime 与诊断

| 命令 | 用途 |
|---|---|
| `buildr runtime list` | 查看 supported adapters、capabilities 和推荐命令。 |
| `buildr doctor` | 聚合 workspace、registries、Components 和 Commands；未传 `--agent` 时只诊断有受管证据的 runtime inventory，Agent 默认传 `--agent` 与 `--json` 获得当前 runtime readiness。 |
| `buildr render <agent>` | 组合投射 Rules entry 与 workspace Skills 到 workspace destination，不安装产品入口 Skill。 |
| `buildr sync <agent>` | 同步当前本地 workspace checkout 中的产品源能力并准备完整当前 Agent runtime；不更新 CLI，也不隐式执行 Git 更新。 |
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

没有该文件时，doctor 不产生 finding，`task-verification` 继续从 AGENTS、POM、项目文档和已有测试入口发现政策。文件存在时 doctor 只做结构、路径和能力图校验，不运行命令或探测测试环境。用户通过 Agent 说“初始化测试声明”或“更新测试声明”即可生成/增量补充候选；新增能力默认 discovered 或 trial/advisory，不会自动成为 Candidate required gate。

## Skill capability contracts

`buildr.skills/v3` 为每个 workspace Skill 保存稳定 `assetIdentity`/`sourceIdentity`，并支持 versioned contract、provider `provides`、consumer `requires` 和 workspace 默认 binding。Project context 使用 `buildr.project-capabilities/v1`。安装 provider 本身不会静默改绑。

Contract 格式、scope 规则、替换示例以及 `ready` 的边界见 [Skill Capability Contracts](skill-capability-contracts.md)。

## Product maintenance / workflow internal

- `buildr package check/build`：产品 package 维护和构建，不是普通 workspace 日常命令。
- `buildr openspec converge <change> --project <project> --target <workspace> --json`：Buildr OpenSpec 单一收敛事务；内部完成规划、隔离 strict validation、条件式 canonical 应用、写后确认与 `archive --skip-specs`，结果为 `passed|blocked|recovery-unprovable`。
- `buildr openspec baseline create`、`check --stage pre-sync|post-sync`、`sync-plan`、`sync-apply`：历史 workflow 诊断兼容入口；新 Task Finish 和新 Change 不再编排或写入对应阶段 sidecar。
- `buildr bootstrap guide`：产品 Skill 不可用时的纯文本兜底说明。

这些命令可执行，但不构成普通用户需要记忆的 public asset API。

## 内部实现边界

`bin/buildr.mjs` 是稳定 npm bin 路径，实际命令通过内部 `src/` runtime 和唯一 command registry 执行。该模块树随 tarball 发布以保证命令可运行，但不是公开 JavaScript API，不承诺文件级 import 兼容；维护约定见 [CLI 内部架构](cli-architecture.md)。

## 远端 Skill 请求

resolved `skill-url` 默认具有有限请求时间。维护者可设置：

- `BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS`
- `BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS`

值必须是 `1..120000` 的整数毫秒。生产环境建议为 resolved source 提供 `sha256-<hex>` integrity。
