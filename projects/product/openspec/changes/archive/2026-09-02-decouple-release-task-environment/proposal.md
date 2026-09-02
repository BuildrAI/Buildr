# Release直接消费自己的执行事实

## Why

发布系统仍把统一Task Environment的ready、Plan、Receipt和controller投影当作Git写入、依赖准备、发布上下文与closeout前置。统一环境删除前，Release必须改为直接消费真正的owner：Task Record、Git Worktree evidence、Release自己的依赖准备结果、exact Node、Product Candidate、Git与retained controller。

## What Changes

- Release Git mutation直接核对active release Task、matching Worktree evidence、checkout、branch与HEAD。
- Release preparation在受控临时checkout中按Buildr Service真实`npm ci`入口执行，结果只保存source inputs、exact Node、command与outcome identity。
- Release context/readiness/transaction evidence使用Worktree、Preparation和Node投影，不再保存Environment字段。
- Release closeout直接调用Task Record、Worktree cleanup和Doctor；成果成立后cleanup失败只阻塞closeout善后，不撤销Publication。
- Task evidence correlation只关联release/support Task和冻结source，不再要求Task Environment evidence。

## Non-goals

- 不重构selection、Candidate、artifact、受保护publish workflow、main/dev reconciliation或发布授权。
- 不删除统一Task Environment本体；由后续Change完成。
