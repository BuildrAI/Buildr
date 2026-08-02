---
schemaVersion: buildr.capability-contract/v1
id: buildr.task-worktree-lifecycle
version: 1
---

# 任务 Worktree 生命周期

## Purpose

创建或定位、保留并安全清理隔离的任务 worktree。

## Consumer Obligations

consumer 必须提供 workspace 与仓库边界、稳定的任务身份、任务状态、集成证据，以及已知的本地入口依赖。

## Minimum Guarantees

provider 必须为每个仓库维护唯一 canonical task checkout，防止重复任务 artifacts，保留未完成工作；缺少 clean-tree 和集成证据时必须拒绝清理。

## Effects and Authorization

实现型任务允许创建本地 task checkout。删除本地 worktree 或分支必须具备当前生命周期授权；删除远端分支或丢弃工作需要单独的明确授权。

## Result Evidence

返回 canonical path、任务分支、仓库、created/reused/retained/removed 状态、清理前置条件、本地入口迁移需求；checkout 发生变化时还必须返回 `treeChanged`。

## Decision Points

canonical path 被占用、仓库边界不明确、存在未提交工作、无法证明已经集成，或清理会遗留失效的本地 CLI/runtime 入口时，必须停止。

## Allowed Variations

在已声明 workspace 边界内，provider 可以自行选择分支前缀、保留周期、多仓命名方式和本地目录布局。
