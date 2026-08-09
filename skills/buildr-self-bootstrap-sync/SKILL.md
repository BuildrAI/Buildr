---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace的Formal Task Finish成功或只被retained Doctor阻塞后使用；按冻结Task Contribution去重执行package sync、development CLI、development Local App，并以最终Doctor或same-run resume收敛。
---

# Buildr Self-bootstrap Activation

本Skill只属于Buildr自举Workspace。它是`buildr-self-bootstrap` Component唯一的activation orchestrator，不是Finish provider、产品阶段或用户Workspace默认能力。它不创建receipt、数据库记录、事件或状态机，只使用当前会话中同一Formal Finish Result、产品resume事实与命令evidence。

## 输入与适用性

只消费当前`buildr.task-finish-result/v2`中的Task ID、run identity、Agent、canonical Workspace、remote/target branch、carrier/final或remote-after ref、Environment绑定的retained Node/CLI identity、Delivery Carrier内冻结Task Contribution paths，以及blocked路径的matching resume token。不得从HEAD、dirty tree、当前diff、时间或安装结果反推贡献。

Result必须恰好属于一种模式：

- `complete`：`status=complete`、五阶段完成且Environment cleanup成功；
- `doctor-blocked`：`status=blocked`、`primaryFailure.phase=deliver`、`operation=retained-doctor`、carrier/remote readback/partial delivery完整、`delivery.status=activation-blocked`、Environment尚未cleanup且`resume.phase=deliver`包含matching token。

`doctor-blocked`只有至少一个下述动作适用时才能覆盖普通停止规则。其他blocked/failed Result、并列failure、缺失partial delivery或无动作匹配一律返回`not-applicable`并保留原Finish结论。

按规范化Workspace相对路径形成封闭动作集合：

- `sync-retained-workspace`：`projects/product/services/buildr/package/manifest.yml`或`projects/product/services/buildr/package/targets/workspace/**`；
- `install-development-cli`：`projects/product/buildr`、`projects/product/services/buildr/bin/**`、`projects/product/services/buildr/src/**/*.mjs`、CLI安装/卸载脚本、`package.json`或`package-lock.json`；
- `install-development-local-app`：`projects/product/services/buildr/src/interfaces/local-app/**`、`projects/product/services/buildr/src/interfaces/cli/launcher.mjs`、`projects/product/services/buildr/package/launchers/**`、`projects/product/services/buildr/package.json`、`projects/product/services/buildr/package-lock.json`或`projects/product/services/buildr/LICENSE`。该动作required依赖同一plan的`install-development-cli`；
- `finalize`：任一前三项适用时，`complete`模式最后执行一次指定Agent Doctor，`doctor-blocked`模式最后恢复一次同一Finish run。

同一动作即使被多条路径命中也只执行一次。所有路径均未命中时返回`not-applicable`，不执行sync、Git、CLI install、Local App install、Doctor或Finish resume。

## 执行

### 共同preflight

1. 核对Formal Result模式、Task/run、frozen paths、canonical Workspace、retained target branch、configured remote与carrier/final或remote-after ref一致；`doctor-blocked`另外核对唯一retained Doctor failure与matching resume token。
2. 核对retained checkout在Result声明的target branch，HEAD等于complete final ref或blocked remote-after ref，除Finish metadata外clean；不stash、reset、rebase、merge或覆盖。
3. 核对Environment Receipt中的Node executable与retained Product CLI仍可用；不得回退到PATH上的其他Node/CLI。
4. 记录动作plan identity、每个分类的matched paths与去重结果。

### Package sync

命中`sync-retained-workspace`时，使用retained Product CLI执行`sync <agent> --target <workspace>`，读取mutation evidence，只接受可证明属于本次sync的受管tracked delta。通过`git-operations`只stage精确owned paths并创建单一普通commit；没有tracked delta时记录no-op。commit必须是complete final ref或blocked remote-after ref的单一后继，随后普通push到Result声明的remote/target branch并回读精确ref。

### Development CLI

命中`install-development-cli`时，从retained checkout运行`projects/product/services/buildr/scripts/install-buildr-cli --node-executable <receipt-node>`。记录installer、Node identity、安装前后`command -v buildr`、`buildr --help`与默认入口指向的retained checkout；目标冲突时停止，不覆盖非Buildr管理文件。

### Development Local App

命中`install-development-local-app`时，先确认本plan的CLI依赖已通过，再用同一retained Product CLI执行`app launcher install --channel development --json`。只接受development channel，记录launcher status、bundle path与绑定的retained commit；不得访问、替换或卸载release channel。若package sync先产生了convergence commit，launcher identity绑定该最新delivered retained commit。

### 最终判定

`complete`模式在任一动作适用时，最后使用同一retained CLI执行一次`doctor --agent <agent> --target <workspace> --json`，要求`health.ready=true`。

`doctor-blocked`模式在动作完成后不另行运行第二个Doctor，而是使用原Result的Task、run id、matching resume token和canonical Workspace恢复同一命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <token> --target <workspace> --json
```

恢复结果必须`status=complete`，且resume重新执行的指定Agent Doctor通过、cleanup完成。再次blocked时只消费新Result并报告其current resume事实，不重复启动本Skill或递归activation。Doctor/resume、sync、CLI install与Local App install必须是独立命令和独立evidence，不合并为不可诊断的shell command。

## 失败与恢复

- staged/未知delta、symlink逃逸、HEAD/remote漂移、非单一后继、installer identity不匹配或launcher channel/commit不匹配时fail closed。
- 不使用`git add -A`、force push或共享历史改写，不把sync delta混入原Task carrier。
- 失败时停止后续不安全动作，报告已完成动作、失败动作、冻结inputs、当前retained/remote/CLI/launcher identity与精确恢复入口。
- `complete`模式失败固定报告“主任务已交付、自举Workspace激活未完成”，不得重新运行Finish或改写已完成Result。
- `doctor-blocked`模式失败固定报告“Formal Finish仍被Doctor阻塞、自举恢复未完成”，保留Product返回的current run/resume事实；只允许上述一次same-run resume，不重跑Formal Verification、生成Candidate、执行Completion Review或改写Development handoff、decision、Task Record。
- activation evidence只存在于当前Agent执行报告；不得写入SQLite、Task Record、Development/Review/Verification、Finish JSON或新聚合store。

## 结果边界

成功报告`passed`，包含输入模式、Formal Result/run identity、frozen paths、分类与plan identity，以及每个动作的`passed|not-applicable`、命令identity、sync commit/push/readback、CLI、launcher和最终Doctor或same-run resume evidence。未命中报告`not-applicable`。该结果不是新的持久authority；`complete`模式不改变Task终态，`doctor-blocked`模式只有Product resume可以形成Formal Finish终态。Task Manager继续独立管理顶层完成状态。
