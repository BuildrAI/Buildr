---
name: task-environment
description: 正式 Task 需要准备、检查、恢复或清理实际执行环境，或按 Task ID 取得 Environment Receipt 的当前机器事实时使用；不用于任务分流、Task Record、验证结论或 Git 集成。
---

# Task Environment Skill

本 Skill 是 `buildr.task-environment/v1` 的默认 provider。它调用公开 CLI，不手写或解析 Environment Receipt。

开始行动时必须读取 `references/project-environment-preparation-v1.md`。只有经`declaration-intake`完成只读发现、展示精确diff并取得用户授权后，才使用`templates/project-preparation.yml`维护长期声明；提交Task选择时使用 `templates/task-environment-plan-request.json`。未经用户授权不得把候选声明写入Project。

## 使用方式

必须已有正式 Task Record，并明确 canonical Workspace：

```bash
buildr task environment prepare <task-id> --agent <adapter> --target <canonical-workspace> --json
buildr task environment prepare <task-id> --plan <json-file> --agent <adapter> --target <canonical-workspace> --json
buildr task environment plan record <task-id> --input <json-file> --target <canonical-workspace> --json
buildr task environment plan inspect <task-id> --target <canonical-workspace> --json
buildr task environment inspect <task-id> --target <canonical-workspace> --json
buildr task environment cleanup <task-id> --target <canonical-workspace> --json
```

- `--agent`对`prepare`必填，必须写成当前宿主，例如 Cursor 会话写`cursor`、Codex 会话写`codex`。不得省略，也不得假设省略后默认为 Codex。未给`--branch`时默认任务分支为`<adapter>/<task-id>`；显式`--branch`优先。
- Project可选维护closed `preparation.yml`，长期声明Project-wide或Service-scoped Recipe。Agent读取Task Record的完整Project/Service scope与构建、验证事实，只选择当前Task需要的Recipe，提交`buildr.task-environment-plan-request/v1`；Application解析声明identity并保存`buildr.task-environment-plan/v2`执行快照。没有长期声明时可显式提交`task-inline` Recipe，但不得静默回写Project。
- `prepare --plan`可一次完成登记与准备；若Agent必须先检查Task checkout，可先运行无Plan的`prepare`取得受控执行根（结果明确blocked），再运行`plan record`和`prepare`。
- Plan Request只是CLI的一次性输入，不是Environment资源或长期事实。需要JSON文件时，Agent必须在操作系统临时目录创建，不得写入Workspace的`.buildr/tmp/`、`.buildr/transient/`或其他受管资产目录；`prepare --plan`或`plan record`成功后必须立即删除。命令失败时，只有仍需用同一输入诊断或重试才能暂时保留，并必须报告路径；问题解决、放弃重试或Task终止后立即删除。
- Application保存的resolved `buildr.task-environment-plan/v2`与`buildr.task-environment-receipt/v5`是Plan和机器状态authority；原始Plan Request不进入SQLite。Environment cleanup只清理Receipt已登记资源与provider-owned执行位置，不扫描或删除调用方临时输入。
- `prepare` 同时承担首次准备和幂等恢复；只重跑输出缺失或 executable/input identity 漂移的 Step，没有单独 `restore`。
- `inspect`只读重新观察已保存Plan的executable、inputs和outputs；它不执行Step、不创建或修复输出、不回写Receipt。
- `cleanup`只在Task已明确abandon，或Buildr已持久化并能重新验证Delivery evidence时成立。Delivery可来自自动Finish或Agent直接交付后的reconciliation；Agent不提交claimed success，也不绕过ownership和Task Contribution等价检查。

## 执行边界

取得 `ready` 后，只在结果的实际 execution roots / validation root 中写入、构建和测试，并使用结果指定的执行 CLI。Environment Receipt 独占 Runtime、CLI、Preparation Declaration/Scope/Recipe/Step、projection、动态资源、ready、恢复和总 cleanup；Task Record 不保存这些字段。Recipe只允许无 shell 的明确 executable、args、Project或Service相对cwd、input与预期output；受管Node/npm等使用`workspace-foundation` executable，其他技术栈可使用Project/Service wrapper或明确绝对executable。Buildr不实现Node/Python/Go/Rust适配器，也不扫描manifest。不得提交env、secret、stdin或任意shell。Buildr Web Environment GET只展示已保存current，不等同于CLI live inspect。

候选 Skill、CLI 与 runtime 可以在自身任务验证工作区测试，但候选不能写 retained Workspace、其他 Task worktree 或共享 user runtime，也不能认领或清理自己的 Environment。真实 Agent session 是否采用候选 runtime 属于 Task Verification，不在这里证明。

## 停止条件

Task/Workspace不匹配、省略`--agent`、Plan Request未完整覆盖Task Project/Service scope、声明/Recipe identity漂移、Receipt损坏、retained Environment Manager不可信或源码dirty、provider/resource identity漂移、required Recipe/Step缺失/漂移/执行失败、必需probe blocked、执行根越界或cleanup未授权时停止，保留现场并报告具体Declaration/Scope/Recipe/Step diagnostic与next action。Task checkout/provider evidence决定源码版本；不要从cwd、分支、同一HEAD或旧worktree receipt猜ownership，retained Buildr hash同样不是ownership；也不要由Environment自动fetch/rebase。
