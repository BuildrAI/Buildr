---
name: buildr-self-bootstrap-sync
description: Buildr 自举工作空间中的已交付改动涉及规则、技能、组件、命令或产品运行输入时使用；由唯一执行器完成适用同步、开发应用更新、入口验证与诊断。正式任务记录可选；无关改动和未安装自举组件的工作空间不适用。
---

# Buildr自举激活（Buildr Self-bootstrap Activation）

本Skill只属于Buildr自举Workspace，是`buildr-self-bootstrap` Component唯一的Activation owner。它不是Delivery provider，也不是用户Workspace的默认能力。

## 定位与默认入口

本技能（Skill）只处理 Buildr 自举工作空间的激活，不负责交付业务内容或任务完成登记。明确的基线到交付提交命中实际自举输入时，使用同一执行脚本的直接模式：

```bash
<retained-node> skills/buildr-self-bootstrap-sync/scripts/closeout.mjs \
  --base-ref <base-commit> --delivered-ref <delivered-commit> \
  --branch <target-branch> --remote <remote> --agent <adapter> \
  --target <canonical-workspace> --node-executable <retained-node> --detail full
```

脚本通过 Git 复核基线、实际改动、当前分支及远端包含关系。正式任务记录不是前置条件；可选 `--task <task-id>` 只补充说明，不查询或修改任务状态。参数不是成功证明；脚本不写第二交付状态库。没有对应环境时也不补造环境。成功和失败都按实际动作返回，已有交付不撤销。

默认模式先核验现场并短暂占用自举锁，再按实际变更执行适用的同步、精确提交和普通推送、开发应用更新、显式开发入口检查与最终诊断。已推送内容不重复推送；提交后推送失败可用同一组输入恢复。未提交同步结果、未知锁或身份变化应保留并说明，不自动丢弃或夺锁。

适用范围包括根与项目/服务 `AGENTS.md`、`rules/`、`skills/`、`components/`、`commands/` 和产品运行输入。已交付范围命中时执行对应动作；不按是否有任务、任务是否完成或提交作者判断。未提交或尚未交付的源内容先完成交付。

本脚本只接受上述直接交付输入；失败恢复使用同一基线、交付提交、分支、远端和宿主，任务编号不参与新后继提交的身份。已有任务的成果、记录和资源依据当前事实核对后，再选择适用激活或原资源安全处置。

失败时报告已发生动作、具体失败点及当前交付事实；既有成果不重推。Worktree和具体资源由各自owner独立清理，不改写任务完成事实。
