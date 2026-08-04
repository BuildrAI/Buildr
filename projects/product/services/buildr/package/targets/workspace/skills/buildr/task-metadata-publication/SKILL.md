---
name: task-metadata-publication
description: 用户或lifecycle consumer要求把canonical Workspace中一个明确Task的portable exact owned records独立commit或push到Git时使用；不用于发布Candidate/源码、Task Finish、批量metadata或选择通用Git策略。
---

# Task Metadata Publication

本Skill是`buildr.task-metadata-publication/v1`的唯一provider，required消费selected `buildr.git-operations/v1`。它只决定一个明确Task的metadata publication scope与顺序；record语义留给各writer，Git mutation留给Git Operations。

## 1. 取得明确调用边界

开始前确认canonical Workspace、Task ID、真实repository、source/local ref、push适用时的remote/destination ref，以及分别允许的local commit/history与remote push effects。调用各writer read model取得record validity与Project/Service/Change reference diagnostics；writer blocked时停止，不自行解析或修复schema。

只组合contract声明的五个exact paths：

- `buildr.task-record/v1`：`.buildr/tasks/<task-id>/task.yml`；
- `buildr.task-development/v2`：`.buildr/tasks/<task-id>/development.yml`；
- `buildr.task-verification/v3`：`.buildr/tasks/<task-id>/verification.yml`；
- `buildr.task-review/v1`：`.buildr/tasks/<task-id>/reviews/planning.yml`、`.buildr/tasks/<task-id>/reviews/completion.yml`。

不得扫描Task目录、使用glob/exclusion list或把`git add -A`当ownership。缺失optional records保持缺失；`environment.json`、Finish、asset-review、mutations、worktree/runtime、Candidate、delivery source、其他Task与其他owner内容不进入scope。

## 2. 建立并保留无状态snapshot

从当前runtime `SKILL.md`所在目录运行：

```text
node scripts/publication.mjs snapshot --workspace <canonical-workspace> --task <task-id> [--repository <repository>]
```

只消费`ready|aligned|local-only|not-applicable`结果。`blocked`时保持现场。snapshot token绑定每个declared path的present/absent与bytes identity；不写Receipt/history。

`local-only|not-applicable`时不调用Git Operations，报告当前records仍保留。archived/retired/unavailable reference只在writer安全可读时作为non-blocking diagnostic返回。

## 3. 独立commit并执行post-commit gate

先用helper的`operationPaths`作为consumer-owned exact scope调用一次Git Operations `commit`。只创建新的metadata-only commit；不混入或amend已共享Candidate/delivery commit，不修改scope外staged/dirty/untracked。

commit成功后运行：

```text
node scripts/publication.mjs verify --token <snapshot-token> --commit <commit>
```

只有`verified`才可push。revision drift、额外path、不同blob或ref/repository drift时保留local commit与commit Result，阻止push；不reset、amend或回滚。

重试commit前运行`equivalent --token ... --target-ref ... --source-ref ...`。返回`reusable`时复用未共享等价commit；返回`aligned`时不再commit/push；不能证明时不改写历史。

## 4. 独立push并核验完整range

push前运行`range --token ... --target-ref ... --source-ref ...`，再由Git Operations按其contract重新核验remote/destination与完整range。range含scope外commit、remote drift或普通push rejection时blocked，不rebase、merge、换ref或force push。

commit与push必须保留两个独立Result。commit成功、push失败时报告`partial`：local history已改变、remote未改变；后续重试先走等价commit检查，不生成重复commit。

## 5. 返回与authority边界

返回Task/Workspace/repository/ref、writer/reference diagnostics、declared/present/absent/operation paths、snapshot/post-check，以及适用的commit与push Results和实际effects。publication失败不得修改Task terminal status、Development Candidate/generation/decision/handoff、Review/Verification Result或Finish evidence。

本Skill不新增公共CLI/Application、数据库、registry、transaction、lock、scheduler、publication history或批量发布；不恢复`git-workspace-update`、`git-task-integration`、`git-single-operation`。
