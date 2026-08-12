# 整体忽略 Buildr Task 本机目录

## 一句话摘要

让 Buildr package、`init` 与 `sync` 一致在 Workspace 根 `.gitignore` 中维护 `/.buildr/tasks/`，避免任何 Task 本机状态进入 Git 候选。

## 背景与问题

Task current records 已迁入 `/.buildr/local/workspace.sqlite`，`.buildr/tasks/` 只保留 Environment Receipt 与不再读取的旧 YAML。当前默认规则仍只精确忽略 `environment.json`，无法覆盖 inert legacy records，且已有 Workspace 的 sync 路径没有完整补齐这一边界。

## 目标与非目标

目标是让新旧 Workspace 幂等获得 broad ignore entry，并保持用户 `.gitignore` 内容不变。非目标是不迁移或删除旧 YAML、不改变 Environment Receipt path、不自动取消 Git index 中已跟踪文件。

## 受影响用户或角色

使用 Buildr 初始化或同步 Workspace 的 Agent 与维护者。

## 核心流程

新 Workspace 由 package baseline 和 `init` 直接得到规则；已有 Workspace 在 `sync` 时追加缺失规则；重复执行保持零额外改写。

## 关键变化

- canonical entry 从 `/.buildr/tasks/*/environment.json` 收敛为 `/.buildr/tasks/`。
- package、init、sync 三条入口保持一致。
- 旧 precise entry 与已跟踪历史文件保持原样。

## 影响、风险与兼容性

已有 Workspace 可能同时保留 broad 与 precise 两条规则，这是安全且兼容的冗余。整目录忽略不会影响已跟踪旧文件，也不会改变任何 Task 数据 authority。

## 验收摘要

package template、新 Workspace 初始化和已有 Workspace sync 都必须得到 broad entry；重复 sync 不重复追加，用户规则和旧 precise entry保持不变。

## 技术 Artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-environments/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
