---
name: task-development
description: 正式Task从首个proposal、方案或直接实现开始，到稳定Content Target、Task Candidate、Current Knowledge、推进决定与研发交接的全过程使用；不用于Task Record、Task Review、Task Verification、测试执行或交付执行。
---

# Task Development

本Skill编排`buildr.task-development/v4`。它维护研发聚合事实，不管理任务验证。Buildr Web只消费Application `inspect`的只读投影；不得手写Development Receipt。

所有内部action使用matching `buildr task environment inspect <task-id> --target <canonical-workspace> --json`返回的retained controller invocation，再追加`__internal task-development <action> ...`。不得使用candidate CLI、resource payload root或源码内部路径写canonical Workspace。
具体调用以Environment read model返回的controller为准；planning snapshot使用Planning Identity Application返回的`planningNodes`，不得自行重算。

## 进入与继续研发

1. 读取active Task、Intent、Project/Service scope和全部Change。
2. 恢复matching ready Task Environment，只使用Receipt返回的execution roots。
3. 首个proposal、design或实现动作前调用`begin`，显式提交完整Change dispositions与planning snapshot；无节点时使用`{"targetIdentity":null,"nodes":[]}`。
4. Planning artifact形成或变化后调用`planning`。节点只保存authority、portable reference、identity、disposition与最小summary；`waived`必须有明确授权source。

Task可能产生用户可见前端变化且triage尚未明确确认时，先询问是否需要界面原型（UI Prototype）。只有明确确认需要时才加载selected `ui-prototype` Skill；用户拒绝或未确认时继续研发，不让原型选择阻塞其他工作。已有原型且用户未明确要求忽略时，正式前端实现必须读取全部相关原型并遵循其信息架构与交互。

OpenSpec planning artifacts达到apply-ready后，使用matching retained controller调用：

```text
<controller-command> <controller-args-prefix...> __internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>
```

只有`resolved`结果的target identity与planning nodes可以写入planning snapshot；不得使用raw digest、mtime、Git ref或旧Review target代替。

`discover`只生成`observe`的closed输入：

```text
<controller-command> <controller-args-prefix...> __internal task-development discover --task <task-id> --target <canonical-workspace> --input-json '{"action":"observe"}'
```

它不接收Formal Plan、不生成verification policy，也不读取Task Verification。

## 稳定内容与Candidate

完成内容、测试开发与修复，并让全部关联Change完成deterministic convergence/archive或明确not-applicable后，调用`observe`建立stable Content Target。任一Change仍pending时必须先完成实际工作，不能为推进流程伪造stable。

Planning snapshot current、Content Target稳定且Change非pending后，可调用`freeze`形成或复用Task Candidate。Candidate只绑定generation、Content Target与Task Context；Task Review或Task Verification变化不得改变Candidate或generation。

Current Knowledge可以在实现前后形成；改变delivery bytes后必须重新observe。多Project Task按Project完整提交disposition。`blocked`阻止Development handoff，`attention`保留但不自动阻止。

Candidate形成后，根据Development自身的current Candidate与Current Knowledge事实调用`decide`记录proceed/blocked。Task Review是Agent按目标选择的独立证据，不写入Development，也不改变decision。

只有Planning snapshot、Candidate、Current Knowledge和proceed decision均current时，才能调用`handoff`形成append-only快照。Task Finish是否使用该快照由收尾目标决定。

## 与Task Review和Task Verification的边界

Task Verification是独立能力：Agent在开发中直接运行快速测试但不记录，开发完成后根据Project测试地图执行相关测试和低成本完整回归，再保存任务验证报告。

Task Development：

- 不依赖`buildr.task-review` capability，不读取或保存Review Result，不维护planning/completion gate或waiver；
- 不依赖`buildr.task-verification` capability；
- 不读取测试地图或任务验证报告；
- 不保存verification policy或verification gate；
- 不派生Formal Verification Readiness；
- 不因报告缺失、失败、stale或损坏改变Candidate、decision或handoff；
- 不生成Plan、run、reconcile或Execution Record。

需要同时展示研发和验证时，界面分别读取两个独立Application，不建立流程依赖。

## 父子任务与收尾

父子协调由`task-manager`负责，不建立Development父计划或贡献绑定。父任务完成必须取得明确用户授权。

研发结果就绪后报告实际成果和限制。用户要求交付或收尾时，由`task-finish`按当前目标独立组合工具；不得为满足旧流程补造Task Verification、Candidate或handoff。

## 完成证据

只报告实际存在的planning identity、Content Target、Candidate generation、Current Knowledge、decision与handoff。Task Review和Task Verification分别报告，不写入Development证据，也不得把commit、branch或worktree当Candidate。
