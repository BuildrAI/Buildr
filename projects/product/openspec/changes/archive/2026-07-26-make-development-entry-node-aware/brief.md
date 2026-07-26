# 让 Buildr 开发入口自动选择兼容 Node

## 摘要

让自举 workspace 的稳定开发入口自动使用当前环境中可发现的 Node 20+，避免 Agent 每次先被系统 Node 18 阻断再手动切换 runtime。

## 背景与问题

`projects/product/buildr` 当前直接使用 `/usr/bin/env node`。当 PATH 首个 Node 是 v18 时，入口在 Buildr 自身运行前即因 ESM 解析失败；即使 Agent 已携带兼容 Node，也必须额外修改 PATH。

## 目标与非目标

目标是保持 Project bridge 稳定且轻薄，在 Service 内集中选择兼容 Node，并在无法启动时提供明确恢复动作。非目标是安装 Node、改变 npm 发布入口或接管 Agent runtime 管理。

## 受影响用户或角色

主要影响在 Buildr checkout 中执行开发 CLI 的维护者和 Agent。

## 核心流程

调用 Project bridge 后，Service 启动器依次检查显式 `BUILDR_NODE`、PATH 中的 Node 和 Agent runtime 相邻的 bundled Node；选中首个满足 Node 20+ 的候选后启动现有 CLI。

## 关键变化

- Project bridge 从 Node shebang 改为 POSIX shell 薄转发器。
- Service 新增可测试的开发 Node 选择入口。
- 无兼容 Node 时返回最低版本和恢复动作。

## 影响、风险与兼容性

已有 Node 20+ 环境保持兼容；npm bin 不变。相邻 bundled Node 只作为有限 fallback，不做磁盘递归搜索。

## 验收摘要

系统 Node 18 在前且 Agent bundled Node 可发现时，`projects/product/buildr` 可直接运行；显式 override 优先；完全缺少兼容 Node 时给出可操作诊断。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/npm-cli-package/spec.md`
- `tasks.md`
