# 隔离自举 Workspace 的稳定 Controller

## 一句话摘要

让 retained Buildr controller 成为 canonical Workspace SQLite 的唯一写入者，候选 Buildr 只在每个 Task 的隔离验证 Workspace 中运行 migration 和 smoke 测试。

## 背景与问题

自举任务的候选 worktree 曾把新增 migration 应用到主 Workspace 数据库，而 retained runtime 尚未包含该脚本。SQLite 正确地报告 database-newer-than-runtime，但真实任务进度也随之无法写入。多个并发任务会扩大这种不匹配风险。

## 目标与非目标

目标是在真实 Task 进度与候选产品验证之间建立硬边界：真实进度只写主库，候选数据库只用于该任务验证，成功后合并源码再由 retained runtime 升级主库。

非目标是停用 migration identity 检查、为失败任务向主库执行 schema 回退、把临时数据同步/合并到主库，或把普通用户 Workspace 改造成多数据库产品。

## 核心流程

1. retained controller 创建、更新和读取 canonical Workspace 的真实 Task 记录。
2. 候选 Buildr 在 receipt 绑定的 Task Validation Workspace 初始化独立 SQLite，运行自身 migration 与受影响测试/Local App smoke。
3. 候选集成时，如 rebase、冲突解决或 migration identity 改变，则基于最新 retained 基线重建验证 Workspace 并重新验证受影响范围。
4. 合并成功后，retained controller 激活新 runtime，并在下一次合法 writable action 中连续升级 canonical 数据库。

## 影响与兼容性

普通用户 Workspace 仍只有一个 canonical SQLite；用户项目/服务的业务数据库仍与 Buildr Workspace 数据分离。自举任务新增本地临时验证数据库和 provenance guard，但不迁移或合并测试数据。

## 验收摘要

证明候选 runtime 在写主库前被拒绝且零 mutation；证明候选可在隔离库完成 migration/测试；证明 retained runtime 集成后可连续升级主库；证明并发候选 migration 在重新编号与重建验证库后能顺利收敛。

## 技术入口

- [proposal](proposal.md)
- [design](design.md)
- [delta specs](specs/)
- [tasks](tasks.md)
