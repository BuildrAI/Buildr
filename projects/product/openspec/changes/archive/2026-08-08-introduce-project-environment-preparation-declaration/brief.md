# 项目环境准备声明

一句话摘要：Project在Git中声明可复用的环境准备Recipe，Agent按Task scope选择，Task Environment在SQLite中保存执行快照与当前机器回执。

## 背景与问题

现有Environment Plan依赖Agent为每个Task重新分析并抄写Service Steps，不能复用Project长期事实，也不能支持真正的Project-only preparation。声明入口变化后，旧Plan/Receipt还缺少长期来源identity来准确失效。

## 目标与非目标

目标是增加可选`preparation.yml`、Recipe选择、Plan v2、Receipt v5、严格只读inspect、幂等恢复和多层Local App诊断。非目标是技术栈扫描/适配器、后台声明管理、Commands/Skills安装或第二套Environment store。

## 受影响角色

- Agent：从“临时生成完整Plan”改为“选择Project Recipe或显式task-inline fallback”。
- Project维护者：确认长期Recipe写入Git。
- Local App用户：查看Declaration、scope、Recipe与Step的保存事实。

## 核心流程

`preparation.yml → Agent按Task scope选择 → Environment Preparation Plan → prepare/inspect → Environment Receipt`。

## 关键变化

- Project/Service均可拥有Recipe，多Service分别形成独立readiness。
- Plan绑定Declaration与Recipe identity；Receipt绑定当前executable/input/output observations。
- `prepare`执行与恢复；`inspect`和Local App GET均不修复。

## 影响、风险与兼容性

SQLite current仍是唯一Environment authority。旧Plan v1/Receipt v4只读兼容，新writer只生成v2/v5；旧runtime遇到v5必须fail closed。task-inline保留零配置入口，但明确提示没有长期声明来源。

## 验收摘要

覆盖Project-only、多Service、非Node wrapper、声明/lockfile漂移、部分恢复、失败诊断、重复prepare、Local App只读与fresh worktree `build:web`。

## 技术Artifacts

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
