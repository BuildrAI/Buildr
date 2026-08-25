---
name: buildr-self-bootstrap-sync
description: Buildr自举Workspace取得matching Task delivery result后，用唯一runner完成retained sync、development Buildr Web、入口验证与Doctor；失败只形成Activation attention，不撤销Delivery。普通Workspace update或没有matching Task时不适用。
---

# Buildr自举激活（Buildr Self-bootstrap Activation）

本Skill只属于Buildr自举Workspace，是`buildr-self-bootstrap` Component唯一的Activation owner。它不是Delivery provider，也不是用户Workspace的默认能力。

## 定位

主任务Delivery与自举Activation相互独立：

- Task可以由Buildr自动Finish交付，也可以由Agent直接Git/PR交付后通过reconciliation登记；
- 本Skill只消费matching `buildr.task-finish-self-bootstrap-input/v1`稳定投影；
- sync、development Buildr Web、入口验证或Doctor失败，只形成Activation attention；
- 不重新提交业务代码，不改写Task、Candidate、Verification、Review或Development handoff。

历史遗留的`doctor-blocked` current run仍可兼容恢复，但新Delivery不会因Doctor失败进入blocked终态。

## 适用性

必须同时满足：

1. 当前会话持有matching canonical Workspace、Task、run和delivered ref；
2. Product CLI能投影唯一Workspace repository与冻结Task Contribution activation paths；
3. Workspace repository确有适用自举路径。

reconciliation形成的Delivery可以没有Delivery Carrier；此时使用已验证containment proof中的activation paths。Service repository不能触发Workspace自举。

没有matching Task delivery result、只有协作者提交、普通Workspace update、Doctor drift或本地没有对应Task时返回`not-applicable`，按普通Workspace update处理，不反推Task或Activation。

## 唯一执行入口

Agent只启动一次bundled runner，不拆分补跑阶段：

```bash
<receipt-node> skills/buildr-self-bootstrap-sync/scripts/closeout.mjs \
  --run <finish-run-id> \
  --target <canonical-workspace> \
  --node-executable <receipt-node> \
  --detail compact
```

Runner通过retained `projects/product/buildr task finish inspect --detail self-bootstrap --json`读取稳定投影，不解析内部Task Finish Result major，也不导入Product Application模块。

Runner stdout默认返回`buildr.long-running-operation-summary/v1`有界摘要；只有诊断需要时才显式使用`--detail full`读取既有完整Result。摘要中的recovery pointer必须先用于回读同一Finish run，不得把stdout丢失、超时或截断当成重跑授权。

## Runner边界

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

## 结果与恢复

显式`--detail full`时，`buildr.self-bootstrap-closeout-result/v1`分别报告每个阶段、Git/ref、lease、sync/push、Buildr Web、development entry和Doctor事实。默认compact只投影终态、关键阶段、主失败、cleanup与恢复入口。

- `passed`：适用Activation完成；
- `not-applicable`：没有Workspace自举动作；
- `blocked`：Activation需要Agent关注，但Task Delivery保持已交付。

Runner一旦取得matching Task/run identity，必须在返回`passed`、`blocked`或`not-applicable`前刷新Finish maintenance中的self-bootstrap terminal evidence。若maintenance writer自身失败，保留原始主失败并把maintenance标为attention；不得伪造可恢复记录。

失败时固定报告“主任务已交付，自举Workspace激活未完成”，并列出已完成effects、当前identity和精确失败点。Agent依据当前事实决定修复或稍后重试；不得重新运行业务Delivery、重新push已交付repository，或把Activation失败改写为Task未交付。

Environment Cleanup由Task Environment独立处理，不由本Skill决定Task终态。
