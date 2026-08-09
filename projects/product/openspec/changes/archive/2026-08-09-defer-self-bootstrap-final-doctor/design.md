## Context

当前 Product executor 在`deliver`末尾运行无`--agent`的 inventory Doctor；任何非ready结果都会让run停在`deliver`，而自举Workspace的append只允许在Formal Finish complete和Environment cleanup之后启动。这样普通Workspace没有得到当前Agent runtime的严格验收，自举Workspace又可能在新版package尚未sync时停住，append无法介入。

现有五阶段run已经支持：blocked phase保存产品resume token、target已经包含carrier时复用`already-contained`、retained Workspace由可信controller执行命令、Environment只在deliver通过后cleanup。现有自举Skill也已经拥有基于冻结Task Contribution paths的封闭sync/CLI/Local App动作计划。缺口不是新workflow engine，而是让append能够消费一个边界清晰的Doctor blocked Result并恢复同一run。

## Goals / Non-Goals

**Goals:**

- 普通Workspace始终以run绑定的指定Agent Doctor作为Finish deliver门禁，失败保持blocked。
- 自举append可以把首次retained Doctor失败视为可修复的临时诊断，先执行冻结范围内的Self-bootstrap动作，再恢复同一Finish run。
- 最终指定Agent Doctor通过后才允许blocked分支进入cleanup和Formal Finish complete。
- 正常Finish已complete的自举任务继续在post-Finish执行既有activation，不改变已交付事实。
- 保持单一Finish run、单一resume token、单一Environment cleanup authority和现有v2 JSON schema。

**Non-Goals:**

- 不提供用户可选择的`skip doctor`、任意hook、命令注入或通用post-Finish provider框架。
- 不让Product executor识别`buildr-self-bootstrap` Component、Product路径分类或执行sync/install。
- 不新增SQLite表、receipt、event/history store或activation lifecycle。
- 不改变Doctor自身finding分类、Component版本authority或runtime projection authority。

## Decisions

### 1. Doctor仍由Product executor执行，但必须选择run绑定Agent

`deliver`使用retained controller执行`doctor --agent <run.identity.agent> --target <workspace> --json --detail compact`。普通Workspace没有append恢复语义，任何非零、无有效JSON或`health.ready != true`仍返回现有retained Doctor failure并停止cleanup。

没有采用“inventory Doctor加Skill层额外Doctor”，因为这会让普通Workspace的Formal Result先完成、Agent runtime验收后置，也会形成两次不同模式的最终结论。

### 2. Doctor blocked Result保存已完成的delivery事实

远端push/readback、carrier containment与activation plan已经成功后，Doctor failure返回`status: blocked`，同时在phase output保存`delivery.status: activation-blocked`、target disposition、carrier/remote refs、containment、activation plan和Doctor disposition。`executeFinishRun`继续使用现有`applyPhaseOutput`写入current run，并生成同一run的resume token；不产生terminal completion，不进入cleanup。

没有增加第二份receipt。compact v2 Result直接投影current run中已有的`delivery`和`resume`。

### 3. append覆盖的是Agent停止规则，不是Product安全规则

普通`task-finish` Skill看到blocked Result立即停止并报告resume。自举Workspace渲染后的append声明一个更具体的覆盖规则：只有同时满足下列条件才调用`buildr-self-bootstrap-sync`：

- blocked phase为`deliver`且failure operation为retained Doctor；
- carrier、冻结Task Contribution、remote readback与matching resume token完整；
- 冻结paths形成至少一个适用的self-bootstrap动作；
- 没有Git、carrier、handoff、render、cleanup或其他并列失败。

Product executor不知道该Component存在，也没有通用defer flag；越过条件的Result继续按普通失败处理。

### 4. Doctor-blocked自举路径先activation，再恢复同一run

专属Skill在blocked路径使用冻结输入形成同一去重plan，执行适用package sync、development CLI与Local App动作。package sync若产生受管delta，仍只提交精确owned paths、普通push并readback。随后使用原run id和产品resume token再次调用`task finish run`。

resume重新进入`deliver`；若sync commit已经推进target且完整包含carrier，复用现有`already-contained`证明，不重建Candidate、不重跑Formal Verification。Product重新执行指定Agent Doctor；通过后才进入cleanup并形成Formal Finish complete，失败则返回新的current resume事实。

正常首轮Doctor已经通过的任务保持既有顺序：Formal Finish complete/cleanup之后运行Self-bootstrap activation，并由专属Skill显式执行最终指定Agent Doctor。两条路径都至多形成一个最终Doctor结论，但blocked恢复路径的最终Doctor由resume中的Product executor执行。

### 5. 失败结果保持事实分层

- 普通Workspace首次Doctor失败：Formal Finish blocked。
- 自举blocked恢复动作失败：Formal Finish仍blocked，报告activation失败与current Finish resume事实。
- 自举resume Doctor失败：Formal Finish仍blocked，以新Result为唯一当前结论。
- Formal Finish已complete后的activation失败：继续使用既有“主任务已交付、自举Workspace激活未完成”语义，不改写Finish Result。

## Risks / Trade-offs

- [Self-bootstrap sync在Formal Finish完成前推进target] → 只允许Doctor-blocked且remote readback完整的run；resume必须用`already-contained`逐路径证明carrier仍被完整包含。
- [任意Doctor错误未必能被sync修复] → append只获得一次有界activation尝试；最终Product Doctor仍fail closed，不接受Agent伪造通过。
- [正常路径与blocked恢复路径出现重复Doctor] → blocked路径由resume Doctor形成最终结论，专属Skill不再追加第二次Doctor；complete路径保留显式最终Doctor。
- [Skill文字覆盖产生歧义] → package/runtime contract tests必须证明append明确覆盖默认停止规则、普通用户runtime不存在该片段，并验证blocked/complete两个分支。
- [旧blocked run缺少partial delivery] → 不迁移、不推断；旧Result不满足新append前置条件时保持原resume行为。
