---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace取得matching Task delivery result后，用唯一runner完成retained sync、development Buildr Web、入口验证与Doctor；失败只形成Activation attention，不撤销Delivery。普通Workspace update或没有matching Task时不适用。
---

# Buildr自举激活（Buildr Self-bootstrap Activation）

本Skill只属于Buildr自举Workspace，是`buildr-self-bootstrap` Component唯一的Activation owner。它不是Delivery provider，也不是用户Workspace的默认能力。

## 定位与默认入口

本技能（Skill）只处理 Buildr 自举工作空间的激活，不负责交付业务内容或任务完成登记。任务已经完成，且明确的基线到交付提交命中实际自举输入时，使用同一执行脚本的直接模式：

```bash
<retained-node> skills/buildr-self-bootstrap-sync/scripts/closeout.mjs \
  --task <completed-task-id> --base-ref <base-commit> --delivered-ref <delivered-commit> \
  --branch <target-branch> --remote <remote> --agent <adapter> \
  --target <canonical-workspace> --node-executable <retained-node> --detail full
```

脚本通过既有 `task inspect` 和 Git 复核任务、基线、实际改动、当前分支及远端包含关系。参数不是成功证明；不要求候选、交接或旧收尾运行，不写第二交付状态库。没有对应环境时也不补造环境。成功和失败都按实际动作返回，已有交付不撤销。

默认模式先核验现场并短暂占用自举锁，再按实际变更执行适用的同步、精确提交和普通推送、开发应用更新、显式开发入口检查与最终诊断。已推送内容不重复推送；提交后推送失败可用同一组输入恢复。未提交同步结果、未知锁或身份变化应保留并说明，不自动丢弃或夺锁。

只有旧任务明确恢复旧运行时才使用 `--run <finish-run-id>`；下列旧运行约束仅适用于该显式模式。新收尾不得为了激活制造旧运行。

## 旧运行恢复边界

Runner依次尝试：

```text
preflight → plan → sync → commit → push → install-buildr-web
→ verify-development-entry → finalize
```

这些阶段只约束Buildr自举副作用，不约束Agent必须如何交付代码。

Runner必须：

- 核验canonical Workspace、retained Node、remote/branch、delivered ref与clean tree；
- 对存在的current/foreign carrier验证非symlink、受控路径、identity与ownership；无carrier的reconciliation结果不得因此失败；
- 在任何target mutation、sync、安装或Doctor前取得matching Task/run target lease，并按token fencing释放；
- 只允许fetch与fast-forward，不merge commit、不rebase、不stash、不reset、不force push；
- 只按冻结activation paths选择sync、development Buildr Web和入口验证动作；
- 使用retained Node显式验证`projects/product/buildr`的development channel、source commit、package/version与CLI entry；
- 保留已发生effects，后续阶段失败时停止新的不安全副作用。

多个已证明的foreign carrier可以隔离共存；Runner不得修改或删除其他Task的carrier。identity、path、lease、remote或history无法证明时，在相应副作用前停止。

## 旧运行结果与恢复

显式`--detail full`时，`buildr.self-bootstrap-closeout-result/v1`分别报告每个阶段、Git/ref、lease、sync/push、Buildr Web、development entry和Doctor事实。默认compact只投影终态、关键阶段、主失败、cleanup与恢复入口。

- `passed`：适用Activation完成；
- `not-applicable`：没有Workspace自举动作；
- `blocked`：Activation需要Agent关注，但Task Delivery保持已交付。

Runner一旦取得matching Task/run identity，必须在返回`passed`、`blocked`或`not-applicable`前刷新Finish maintenance中的self-bootstrap terminal evidence。若maintenance writer自身失败，保留原始主失败并把maintenance标为attention；不得伪造可恢复记录。

失败时固定报告“主任务已交付，自举Workspace激活未完成”，并列出已完成effects、当前identity和精确失败点。Agent依据当前事实决定修复或稍后重试；不得重新运行业务Delivery、重新push已交付repository，或把Activation失败改写为Task未交付。

Environment Cleanup由Task Environment独立处理，不由本Skill决定Task终态。
