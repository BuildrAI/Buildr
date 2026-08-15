# Buildr Bootstrap Guide

本指南面向 Agent，是 Buildr Skill 不可用、未安装、损坏或需要维护 Buildr 时的兜底入口，可通过 `buildr bootstrap guide` 读取。它负责区分 CLI 自更新与 workspace 同步、恢复 Buildr Skill，或在安装失败时给出最小 CLI 兜底流程。
## 首次初始化或恢复 Skill

先发现 Buildr 支持的 Agent runtime：

```bash
buildr runtime list --json
```

识别当前 Agent，并将 `<agent>` 固定为支持列表中对应的参数；当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy`。如果无法和支持列表对齐，停止 Buildr 操作，并请联系 Buildr 作者反馈该 Agent。

workspace 尚未初始化时，用一个高层命令完成源资产、Buildr Skill、当前 Agent runtime render 和最终 doctor：

```bash
buildr init --agent <agent> --target <dir> --name <name> --profile <personal|team|company>
```
技术初始化完成后，不把 `project create` 命令直接交给用户。Agent 应读取最终 doctor 和真实 Workspace 状态，用普通语言完成一次首次使用交接：Workspace 是人和 Agent 共同工作的顶层目录；Project 是业务、产品、系统或长期工作；Service 只在需要代码仓、应用、模块或可执行资产时接入。没有 Project 时询问用户要长期管理什么；唯一 Project 没有 Service 时询问是接入已有资产还是直接开始 Project 范围工作；范围唯一时直接邀请用户描述第一项真实目标；有多个候选时只询问消除范围歧义所必需的问题。不要生成 `WELCOME.md`、持久 checklist 或固定教学 Rule。
已有 workspace 中，用户要求完整检查 Buildr、检查安装状态或“更新 Buildr”时，先运行 `buildr update check --json` 同时读取 GA 正式版与 RC 候选版。
Agent 分别说明 `stable` 与 `candidate` 的可用更新，并让用户选择 GA、RC 或暂不更新。只有用户明确选择后才执行对应命令；不得自动切轨或降级：

```bash
buildr update --track <stable|candidate>
command -v buildr
buildr skill install <agent> --target <workspace-root>
```
用户要求“更新 workspace”或“同步 workspace”时，先确认 workspace root 是否由 Git 管理。Git 管理的 workspace 解析 `buildr.git-operations/v1` binding，读取 selected provider，并由 Buildr Skill 提供明确 workspace、upstream 和 update operation；required provider blocked 或遇到本地改动、分叉、冲突、缺少 upstream 等决策点时停止说明，不自动 stash、reset、rebase、merge、覆盖，也不继续 sync。Git 更新成功后不重复询问 sync；非 Git workspace 跳过 Git provider。然后使用当前 CLI 执行 sync，不先更新 CLI；这不是 `buildr sync` 的隐式 Git 行为：

```bash
buildr sync <agent> --target <dir>
```

用户明确只更新 CLI 时，在选定轨道后只运行对应 `buildr update --track ...`，不追加 Skill install 或 workspace sync。Git 更新属于 Agent 对 workspace 更新意图的编排，不是 `buildr sync` 的隐式行为；`sync` 包含产品能力同步、产品入口 Buildr Skill 安装、从 `.` 递归投射各层 `AGENTS.md` 的当前 Agent runtime render 和 doctor 复查。
只需要在未初始化目录单独恢复产品入口 Skill 时使用专项入口：

```bash
buildr skill install <agent> --target <dir>
```

如果安装后Buildr Skill可用，后续按Buildr Skill工作。本指南只保留Skill不可用时的最小兜底流程。Task Record、Development、Verification、Review与Retrospective current records都由对应Application保存到Workspace SQLite，不进入Git或跨机器同步；不要读取、迁移或生成旧Task YAML。Git Operations只处理用户或上游consumer明确选择的普通Git内容。Environment、Finish、mutations、worktree/runtime、Candidate与delivery source继续遵守各自owner边界。
## 最小兜底

优先使用 Buildr CLI 完成用户指令。workspace 必须完成初始化；未初始化时使用上面的 `buildr init --agent <agent>`，其成功输出已包含最终 doctor，不再重复执行。已有 workspace 中，`buildr doctor --agent <agent> --json` 是最小兜底流程的默认事实入口。不要省略 `--agent`；未指定 Agent 时 doctor 会检查所有支持的 runtime。

```bash
buildr doctor --agent <agent> --target <dir> --json
```

根据用户目标和 doctor 结果继续。创建或修复 Project/Service 必须来自用户意图、已有源资产、明确 repo/ref，或 doctor 指出的可修复 drift。Component 当前只支持 workspace：先用 `buildr component list/check --target <dir> --json` 核对定义和成员，再用带 `--agent <agent>` 的 install/uninstall 完成 runtime 与 doctor 闭环；CLI 不根据对象名称猜测 Component 边界。

```bash
buildr project create <project> --target <dir> [--repo <git-url>] [--title <text>] [--description <text>]
buildr service create <project>/<service> <repo-ref> --target <dir> --name <name> --description <description> --type <type> [--remote <name>] [--integration-branch <branch>]
```

用户要管理业务、产品线、系统或长期工作单元时才创建 Project；Project 资产 repo 用 `project create --repo` clone 到 `projects/<project>/`，不登记外部本地链接。用户提供 service repo 路径、Git URL 或明确要接入服务资产时才创建 Service。Service Domain 使用 UUID、workspaceId、projectId、code、name、description、type 与 source；Git 来源用 `--integration-branch` 保存稳定集成目标，当前 checkout 只观察。Service 规则入口是 Service 目录中的 `AGENTS.md`，不通过 registry 参数指定规则路径。

## 边界

Buildr workspace 是组织（Organization/Root）资产根；Agent runtime 是面向当前 Agent 的可重建入口。组织资产先改变源资产（使用 Buildr CLI），再同步 Agent runtime（使用 render/sync）。

Rules 控制 Agent 的价值观、边界和约束；Skills 封装可复用的专业动作和操作流程。Rule 和 Skill 不以“是否必须加载”作为本质区分；任务触发型流程应沉淀为 Skills，并通过当前 Agent runtime 渲染后使用。

Agent runtime adapter 按“scope 祖先链 + scope 子树”发现和投射 `AGENTS.md`，再按目标 Agent 使用原生入口、scoped vendor rules 或 reference bridge；具体路径、reload 和 UI 前置条件见随包 `docs/agent-runtime-adapters.md`。adapter 不替 Agent 做语义决策。Agent 必须读取 enabled、required 且 installed 的 Rule；对 enabled、optional 且 installed 的 Rule，先检查 description，并在当前任务语义相关时于行动前读取正文。disabled 或 uninstalled Rule 不参与任务。
Skill source 只在 workspace `skills/` 治理。Project `capabilities.yml` 仅表达 requirements、bindings 与 applicability；当前目录使用 Skill 时 render 到 `workspace` destination，明确要求个人全局共享时才 render 到 `user` destination。`init`/`sync` 不写用户层。adapter inventory 为 `partial` 时只证明可观测 filesystem roots 中未发现冲突，不能据此宣称 Agent 内部 plugin/system Skills 全局唯一。
root/Organization 规则维护使用 `rules/manifest.yml` 和 `rules/`。新增规则时，先创建并编辑 `rules/<rule-id>.md`，再运行：

```bash
buildr rules add <rule-id> --target <dir> --description <text>
```

删除 root 规则时运行：

```bash
buildr rules remove <rule-id> --target <dir>
```

如只取消注册并保留规则文件，使用 `--keep-file`；Project 规则当前通过 `projects/<project>/AGENTS.md` 维护。对象级卸载若命中 Component，必须先展示完整成员、runtime 影响以及不会删除的外部 CLI 和 Project 内容，取得二次确认后才执行。
