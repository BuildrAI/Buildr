# 准备任务环境时必须显式指定当前宿主

## 一句话摘要

`task environment prepare` 必须写出当前宿主，不得再省略 `--agent` 并默认为 Codex。

## 背景与问题

prepare 把 `--agent` 当成可选项，解析与 Application 都默认 `codex`，默认任务分支也硬编码 `codex/<task-id>`。Cursor 等其他宿主按字面省略参数后，Environment Receipt 会登记成 Codex，Finish Doctor 再按错误宿主检查。

## 目标 / 非目标

- 目标：省略 `--agent` 必须失败；首次 prepare 登记调用方给出的 adapter；默认分支前缀跟随实际 adapter。
- 非目标：不静默探测宿主；不改变 doctor/init/finish 的 `--agent`；不处理共享 Skill 收据或 Finish 预检对齐。

## 受影响用户或角色

- 所有为正式 Task 准备环境的 Agent 必须写明当前宿主。
- 已写出 `--agent` 的脚本与测试保持兼容。
- 已存在的 Environment Receipt 与 `codex/<task-id>` 分支不自动改名。

## 核心流程

1. Agent 调用 `buildr task environment prepare <task-id> --agent <adapter> ...`。
2. 省略 `--agent` 时 CLI 在进 Application 前失败。
3. 首次成功 prepare 把该 adapter 写入 Receipt，未给 `--branch` 时使用 `<adapter>/<task-id>`。
4. 再次 prepare 必须传入同一 adapter，并匹配已保存分支。

## 关键变化

- `--agent` 对 prepare 变为必填。
- 删除 Codex 作为产品默认宿主。
- 默认 Git 任务分支改为 `${adapter}/${task-id}`。

## 影响 / 风险 / 兼容性

- 这是对“可省略 --agent”的破坏；旧的省略调用会失败。
- 写错宿主仍走既有 mismatch，产品不纠正。
- inspect/cleanup 继续从 Receipt 读取 adapter，不新增 `--agent`。

## 验收摘要

- 省略 `--agent` 非零退出且零写入。
- `--agent cursor` 登记 `cursor` 并默认 `cursor/<task-id>`。
- `--agent codex` 仍默认 `codex/<task-id>`。
- 显式 `--branch` 优先；恢复不改已有分支。
- Skill 示例不再展示可省略 `--agent` 的 prepare。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
