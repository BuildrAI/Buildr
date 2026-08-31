---
name: task-environment
description: 正式 Task 需要准备、检查、恢复或清理实际执行环境，或按 Task ID 取得 Environment Receipt 的当前机器事实时使用；不用于任务分流、Task Record、验证结论或 Git 集成。
---

# Task Environment Skill

本 Skill 是 `buildr.task-environment/v1` 的默认 provider。它调用公开 CLI，不手写或解析 Environment Receipt。

Task Environment只拥有Buildr-managed checkout、Preparation、runtime projection、Task-owned持久资源、正式环境证据与cleanup authority。Formal Task Record、普通编辑、构建或有界测试本身不自动触发本Skill；缺少Plan/Receipt不能成为这些直接动作的通用许可blocker。直接工作不得反向补造Receipt或认领本Skill的ready、资源与cleanup结果。

开始行动时必须读取 `references/project-environment-preparation-v1.md`。只有经`declaration-intake`完成只读发现、展示精确diff，并形成`routine-maintenance`结论或取得长期适用性变化的用户授权后，才使用`templates/project-preparation.yml`维护长期声明；提交Task选择时使用 `templates/task-environment-plan-request.json`。不得绕过Intake分类、静默扩大scope、改变requiredness或把候选能力写入Project。

## 使用方式

必须已有正式 Task Record，并明确 canonical Workspace：

```bash
buildr task environment prepare <task-id> --agent <adapter> --target <canonical-workspace> --json
buildr task environment prepare <task-id> --plan <json-file> --agent <adapter> --target <canonical-workspace> --json
buildr task environment plan record --schema|--example --json
buildr task environment plan record <task-id> --input <json-file> --target <canonical-workspace> --json
buildr task environment plan inspect <task-id> --target <canonical-workspace> --json
buildr task environment inspect <task-id> --target <canonical-workspace> --json
buildr task environment cleanup <task-id> [--expected-source <selector>=<full-commit> --delivered-ref <selector>=<full-commit>] --target <canonical-workspace> --json
```

- `--agent`对`prepare`必填，必须写成当前宿主，例如 Cursor 会话写`cursor`、Codex 会话写`codex`。不得省略，也不得假设省略后默认为 Codex。未给`--branch`时默认任务分支为`<adapter>/<task-id>`；显式`--branch`优先。
- Project可选维护closed `preparation.yml`，长期声明Project-wide或Service-scoped Recipe。Agent读取Task Record的完整Project/Service scope与构建、验证事实，并先用`task environment plan record --schema|--example`发现与实际normalizer同源的closed输入；只选择当前Task需要的Recipe，提交`buildr.task-environment-plan-request/v1`。Skill不得复制第二份schema或绕过Application的Task scope、declaration identity与Recipe ownership运行态校验；Application解析声明identity并保存`buildr.task-environment-plan/v3`执行快照。没有长期声明时可显式提交`task-inline` Recipe，但不得静默回写Project。
- Formal Verification Plan preview或admission返回的closed `planRequest`可以带`auxiliaryPreparation`。Agent只能原样交给本Skill的`prepare --plan`；它引用同Project已登记Recipe并绑定capability identity，不进入Task scope、Change、Content Target、allowed execution roots或源码写入authority。不得自行把辅助Service加入Task Record，也不得手写安装命令。
- `prepare --plan`可一次完成登记与准备；若Agent必须先检查Task checkout，可先运行无Plan的`prepare`取得受控执行根（结果明确blocked），再运行`plan record`和`prepare`。
- Plan Request只是CLI的一次性输入，不是Environment资源或长期事实。需要JSON文件时，Agent必须在操作系统临时目录创建，不得写入Workspace的`.buildr/tmp/`、`.buildr/transient/`或其他受管资产目录；`prepare --plan`或`plan record`成功后必须立即删除。命令失败时，只有仍需用同一输入诊断或重试才能暂时保留，并必须报告路径；问题解决、放弃重试或Task终止后立即删除。
- Application保存的resolved `buildr.task-environment-plan/v3`与`buildr.task-environment-receipt/v6`是Plan和机器状态authority；v3把Workspace path reference与executable authority分开，并把capability preparation closure与基础Task选择分开，v6保存closed runtime invocation与解析后的机器事实。旧Plan/Receipt只读；显式`prepare --plan`才升级。原始Plan Request不进入SQLite。Environment cleanup只清理Receipt已登记资源与provider-owned执行位置，不扫描或删除调用方临时输入。
- `prepare` 同时承担首次准备和幂等恢复；只重跑输出缺失或 executable/input identity 漂移的 Step，没有单独 `restore`。
- `inspect`只读重新观察已保存Plan的executable、inputs和outputs；它不执行Step、不创建或修复输出、不回写Receipt。
- `cleanup`可在任务已完成或明确放弃后执行。已完成任务不要求旧收尾运行：智能体（Agent）已核验完整交付时，成对传递覆盖所有受管Git仓库的 `--expected-source` 与 `--delivered-ref`；必须是已观察的完整提交编号，不接受分支名或缩写。该输入表达调用者的交付核验，不是软件独立证明。Git提供者核对归属、源版本不变、没有未保存内容、交付提交仍由保留分支持有，并删除工作树与本地任务分支，不要求原提交是目标祖先。无输入时仍支持既有祖先包含检查；版本变化或未保存内容只阻止相关删除。完整环境不必重新 ready，清理结果不证明远端交付，也不改写任务结果。

## 执行边界

取得 `ready` 后，只在结果的实际 execution roots / validation root 中写入、构建和测试，并使用结果指定的执行 CLI与`runtimeInvocation`；Agent不得转抄`BUILDR_NODE`、PATH、机器Node路径或cwd。Environment Receipt 独占 Runtime、CLI、Preparation Declaration/Scope/Recipe/Step、projection、动态资源、ready、恢复和总 cleanup；Task Record 不保存这些字段。Recipe只允许无 shell 的明确 executable、args、typed Workspace-relative cwd/input/output与closed executable authority。Buildr不实现Node/Python/Go/Rust适配器，也不扫描manifest。不得提交env、secret、stdin或任意shell。Buildr Web Environment GET只展示已保存current，不等同于CLI live inspect。

### 依赖刷新前的安全核对

当 Workspace 管理的依赖包疑似过期，或已安装依赖与当前源码不一致时，先核对依赖所属的 Project/Service、实际 repository、当前分支、HEAD commit、index/working tree/untracked 状态，以及 package manifest、lockfile 和已声明的安装入口。不要从当前目录、会话 PATH、旧 worktree 或相似包名推断这些事实。

只有目标 Service、源码版本、更新目标和安装入口都唯一明确，且工作树已证明 clean 时，才按对应 owner 流程获取或更新目标源码；源码更新使用已选定的 Git Operation 或 Workspace update，依赖安装使用当前 Task Plan 选定的 Preparation Recipe。不得把 fetch、rebase、checkout、安装依赖或构建测试拼成一个未声明的隐式动作，也不得在执行根之外手工安装。

安装完成后，记录实际源码前后 identity、manifest/lockfile identity、使用的 Recipe/Step、安装输出状态和后续构建或测试结果；这些事实以 Environment Receipt 和对应验证 Result 为准。安装失败或输入 identity 漂移时，按同一 Environment 的恢复路径重新核对并重试，不以聊天摘要或“看起来已安装”代替结果证据。

若工作树有改动、依赖来源或 ownership 不明、分支/commit 目标不唯一、lockfile 与目标源码无法对应，或无法确认受管安装入口，必须停止并报告当前事实与最小下一步；保留现场，不 stash、reset、覆盖、手工改写依赖状态或绕过 owner。

候选 Skill、CLI 与 runtime 可以在自身任务验证工作区测试，但候选不能写 retained Workspace、其他 Task worktree 或共享 user runtime，也不能认领或清理自己的 Environment。真实 Agent session 是否采用候选 runtime 属于 Task Verification，不在这里证明。

## 停止条件

Task/Workspace不匹配、省略`--agent`、Plan Request未完整覆盖Task Project/Service scope、声明/Recipe identity漂移、Receipt损坏、retained Environment Manager不可信或源码dirty、provider/resource identity漂移、required Recipe/Step缺失/漂移/执行失败、必需probe blocked、执行根越界或cleanup未授权时停止，保留现场并报告具体Declaration/Scope/Recipe/Step diagnostic与next action。Task checkout/provider evidence决定源码版本；不要从cwd、分支、同一HEAD或旧worktree receipt猜ownership，retained Buildr hash同样不是ownership；也不要由Environment自动fetch/rebase。
