---
name: task-manager
description: 创建或维护任务、记录工作进展与待处理事项、读取人的答复、纠正状态或调整父子关系时使用；维护当前工作事实，不执行研发、测试或交付。
---

# 任务管理

本技能（Skill）提供`buildr.task-record/v3`：管理目标、范围、直接父子关系、独立状态、结果，以及本机复盘文档摘要和人的决定状态。任务记录通过产品动作维护，不直接编辑数据库。

## 普通任务

确认当前工作空间（Workspace）、任务标识、授权范围及真实目标。已有任务缺少当前记录时先 `task inspect`，刚读取或前一步成功写入返回的完整记录可直接接续。Task Record自身结构有效时始终返回完整记录；响应中的`referenceDiagnostics`只说明当前Project、Service或Change可用性，不属于Task业务事实。`todo`只保存尚未启动的意向；`active`表示已开始。子任务只用于可独立说明目标、范围及成果的交付，临时智能体分工不创建子任务。

使用已有动作：

```text
buildr task create <id> --title <text> --intent <text> [--status todo|active] [--parent-task] [--parent <id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] --target <workspace> --json
buildr task inspect <id> --target <workspace> --json
buildr task update <id> [--status todo|active|completed|abandoned] [--reason <text>] [--summary <text>] [--parent-completion <json-file>] [--parent-task] [--parent <id>|--clear-parent] [set/add/remove flags] --expected-record <recordDigest> --target <workspace> --json
buildr task activate <id> --expected-record <recordDigest> --target <workspace> --json
buildr task complete <id> --summary <text> --expected-record <recordDigest> [--parent-completion <json-file>] --target <workspace> --json
buildr task abandon <id> --reason <text> --expected-record <recordDigest> --target <workspace> --json
```

任务说明引用已登记项目文档时使用具名的工作空间相对 Markdown 链接，例如 `[方案](projects/product/docs/plan.md)`。区分链接可解析与正文可读取；文档只在隔离目录时如实说明，不复制正文冒充已交付。

写入使用已观察的当前 `recordDigest`，应用（Application）继续校验版本。成功响应已包含完整记录与新版本时，直接核对并作为下一动作的输入；仅在响应缺失、发生冲突、工作中断后继续或已知相关事实变化时重读。冲突后重新判断，不静默重放旧输入。完成只保存已成立的结果，不执行Git、部署、验证或清理。复盘正文由Agent按用户要求写入`.buildr/local/task-retrospectives/<task-id>.md`，Task Record只登记摘要与`pending-decision|decided`。

## 记录进展与接续人的答复

出现值得接续的新进展、需要人决定的事项，或用户要求记录时，使用独立工作摘要（Work Context）。它不属于任务记录（Task Record）的四态和完成结果；日常执行无需为每次工具调用写日志。

先运行 `buildr task work-context inspect <id> --target <workspace> --json`。保存时使用返回的 `contextDigest`；尚未登记时使用 `absent`：

```text
buildr task work-context record <id> --expected-current <absent|digest> --progress <真实进展> --next-step <下一步> [--stage <当前节点> | --clear-stage] [--attention-kind decision|acceptance|question --attention-reason <需要人处理的具体原因> | --clear-attention] --target <workspace> --json
buildr task work-context respond <id> --expected-current <digest> --attention <事项id> --response <用户实际表达的意见> --target <workspace> --json
```

有值得接续的阶段变化时，用 `--stage` 记录当前节点：`requirements|design|planning-review|implementation|implementation-review|verification|acceptance|closeout`。它描述正在处理的工作，不是完成证明或执行顺序；验证失败后回到实现修复就记录 `implementation`。省略保留原节点，`--clear-stage` 清除；无需为每次工具调用更新。

更新进展时省略事项参数，会保留已有请求和答复；明确提出新请求会生成新身份。只在确实需要人判断、验收或介入时登记事项，缺少报告、任务处于进行中或长时间未更新不等于需要人处理。

继续相关工作前读取当前答复与真实成果。用户在网页回应后，事项变为已处理，意见和记录时间仍可读取；智能体（Agent）只代录用户实际给出的意见，不能自行代表用户作决定。答复本身不自动授权发布、删除等具体动作，也不改变任务状态。版本或事项身份冲突时重读并判断，保留用户已输入和已保存的内容，不静默覆盖。

完成标准是当前摘要、事项或答复已由应用保存并可读取；之后按实际目标和原有授权继续工作。

## 修订任务事实

已有`task update` / HTTP `PATCH`可以修改标题、目标、范围、规范引用、父子关系及四种合法状态；省略字段保持不变，不提交完整记录覆盖。新增Project、Service或Change仍必须当前可用；删除失效引用或修改无关字段不因其他旧引用不可用而失败。所有非创建写入都必须提供当前`recordDigest`；更正终态事实还需`reason`，由智能体（Agent）准确说明已取得的用户决定，不为原因再创建审批步骤。

更正会把原状态、标题、目标、父关系、结果及原更新时间保存到只读 `resultHistory`，同时记录更正时间与原因。恢复进行中使当前 `result` 为空，但不撤销真实交付、不重新准备环境、不改变子任务状态。已完成子任务可按当前版本和原因关联进行中的父任务，保持自己的状态与成果；重复提交相同内容不追加历史。

设置completed仍需`summary`及适用的父任务完成授权，内部与`task complete`复用同一检查。完成请求不同时更改目标、范围或关系；先修订这些事实，再按当前目标验收。已完成父任务变更目标或范围时显式恢复进行中，不能用旧完成依据覆盖新目标。todo仍不能携带规范变化引用。身份、系统时间、结果历史及专业验证证据不得直接修改。

复盘文档登记、决定或清除必须作为独立更新并提供当前`recordDigest`。登记与决定还要提供固定本机文档的实际摘要；清除只解除Task关联，不删除文件。查看文档零写入，只有用户明确决定是否继续行动后才能标记`decided`。

## 父任务协调（Task Parent Coordination）

人负责整体目标、边界、关键决定与完成授权；智能体（Agent）在这些边界内规划、创建独立子任务、核对成果和持续推进。`--parent-task` 明确创建父任务；`--parent` 指定子任务归属。关联过子任务的父身份保留，不通过移除最后一个子任务取消完成保护。

用户要求创建并准备父任务时，保存目标后继续整理计划与验收标准。简单计划写入目标说明，复杂计划使用现有可读文档并从目标链接。计划说明分工、依赖、边界、剩余工作与重要决定；不要求专用父计划、贡献绑定、环境或研发回执。读取当前计划和实际成果后，按已有授权决定是否启动子任务；未知的关键目标或授权才询问用户。

每个子任务拥有独立目标、范围、结果及按需要选择的研发方式。不得继承父任务的环境、分支、规范变化或验证结论；同一具体规范变化只能有一个活跃变化负责。各仓库按真实边界交付。子任务有依赖时先核对前置成果；软件不替智能体（Agent）证明业务依赖已经满足。

用 `task parent inspect <id> --target <workspace> --json` 查看整体目标、直接子任务结果、历史计划及完成观察身份。计划、子任务状态和真实交付是不同事实；不凭数量推断完成百分比，不因一批子任务完成就缩小总体目标。范围变化先核对产物与版本；改变整体目标、授权或验收需用户决定。被替代子任务明确放弃并说明覆盖，不能伪装完成。

## 完成父任务的边界

**完成父任务必须具有明确指向该父任务的用户授权。** 子任务完成、全部子任务终态、总体验收通过、实现授权或仅针对子任务的收尾均不构成授权；不得为获得成功返回自行编造授权来源。嵌套父任务逐层独立，不能递归完成。

先核对当前整体目标、计划与实际成果，准备可审阅的总体验收说明，包括每个直接子任务成果及放弃、替代、遗留的处置。没有明确授权时保留父任务状态，展示已完成内容与尚需用户决定的完成动作；不向用户索取对单个内部步骤的重复确认。

已明确授权时，读取一次当前父子摘要，取得同一观察中的 `recordDigest` 与 `completion.snapshotIdentity`，在系统临时目录构造 `--parent-completion` 输入：

```json
{
  "expectedSnapshot": "来自 task parent inspect 的 completion.snapshotIdentity",
  "acceptance": {
    "summary": "整体目标、实际成果与验证依据，以及必要遗留的处置",
    "children": [{"taskId": "child-id", "summary": "该子任务的成果覆盖或放弃处置"}]
  },
  "authorization": {
    "source": "当前用户授权的可回查来源",
    "statement": "用户明确授权完成指定父任务的原意"
  }
}
```

`children` 精确覆盖当前直接子任务；无子任务时为空数组。来源和原意必须真实，不能把本技能、默认策略、调用成功或智能体自己的总结写成用户授权。把该输入与本次摘要的 `recordDigest` 交给已有完成动作；不为取得同一版本再调用 `task inspect`。冲突、未结束子任务或依据缺失只阻止相关完成；保留已交付成果，重新核对后处理。直接核对完成动作返回的结果及授权依据，删除本次临时输入；仅响应丢失、冲突或相关事实变化时重新读取，不惯例性追加回读。

旧 `task parent record|reconcile|bind-child|refresh-planning|reconcile-child-delivery|accept` 已退役；旧计划和交接仅供历史查看，不补造旧链，也不把历史缺少授权记录解释成已授权。

## 报告

说明实际改变的对象、当前状态、成果与必要遗留；不要把记录成功称为业务交付成功。任务已完整结束时明确报告完成。只有用户明确要求复盘时才使用`task-retrospective`；完成或放弃本身不自动提示、生成或登记复盘。
