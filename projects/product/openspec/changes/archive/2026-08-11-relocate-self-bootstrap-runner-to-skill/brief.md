# 将自举收尾 Runner 迁入 Skill

## 一句话摘要

把只服务 Buildr 自举 Workspace 的确定性收尾 runner 从用户 npm package 源码范围迁入 `buildr-self-bootstrap-sync` Skill 自身，同时保持现有阶段、恢复和权威边界。

## 背景与问题

当前 runner 没有公共 CLI，也不会被普通 Workspace 路由，但实现位于 Product `src/`，会随 npm package 一起交付给用户。用户不安装自举 Component，也无法使用这项能力，继续发布源码只会模糊产品与自举 Workspace 的职责边界。

## 目标与非目标

目标是让自举 Skill 的 `scripts/` 独占 runner 实现，通过 Product 只读 CLI取得Finish Result，并以打包证据证明普通用户不再收到该实现。

非目标是不改变 Formal Finish、`resolvedContext`、结构化 Result、Git边界、same-run resume或普通Workspace行为，也不新增公共命令、hook、store或execution capsule。

## 受影响用户或角色

- Buildr维护者：自举激活逻辑与自举Skill归属一致，仍以一次Agent调用执行。
- 普通Buildr用户：产品行为不变，npm package不再包含无用的自举runner源码。

## 核心流程

Formal Finish complete或满足唯一Doctor-blocked例外后，Agent调用自举Skill目录内的`closeout.mjs`一次。脚本用retained Product CLI读取同一run的完整Result，形成既有确定性plan并执行适用阶段；Product只继续拥有Finish Result、`resolvedContext`和resume authority。

## 关键变化

- Runner与driver合并为Skill bundled script。
- Product生产源码不再引用或发布self-bootstrap runner。
- Component integrity覆盖新增脚本。
- 集成测试直接验证Skill脚本，打包检查证明runner缺席。

## 影响、风险与兼容性

脚本依赖retained Product CLI和Environment绑定Node，preflight在Git副作用前核对这些事实。用户可见CLI和Result schema不变；普通Workspace不安装该Skill，因此没有迁移操作。

## 验收摘要

- Skill脚本通过fresh、恢复、remote已完成、漂移和same-run resume测试。
- Product `src/`没有self-bootstrap runner或driver。
- `npm pack --dry-run`不包含runner文件。
- Skill/Component投射、Doctor、OpenSpec和受影响产品验证通过。

## 技术 Artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Closeout Orchestration Delta](specs/task-closeout-orchestration/spec.md)
- [Tasks](tasks.md)
