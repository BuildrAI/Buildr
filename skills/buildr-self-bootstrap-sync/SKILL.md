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

脚本通过既有 `task inspect` 和 Git 复核任务、基线、实际改动、当前分支及远端包含关系。参数不是成功证明；脚本不写第二交付状态库。没有对应环境时也不补造环境。成功和失败都按实际动作返回，已有交付不撤销。

默认模式先核验现场并短暂占用自举锁，再按实际变更执行适用的同步、精确提交和普通推送、开发应用更新、显式开发入口检查与最终诊断。已推送内容不重复推送；提交后推送失败可用同一组输入恢复。未提交同步结果、未知锁或身份变化应保留并说明，不自动丢弃或夺锁。

本脚本只接受上述直接交付输入。已有任务的成果、记录和资源依据当前事实核对后，再选择适用激活或原资源安全处置。

失败时报告已发生动作、具体失败点及当前交付事实；既有成果不重推。Worktree和具体资源由各自owner独立清理，不改写任务完成事实。
