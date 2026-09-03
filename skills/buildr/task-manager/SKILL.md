---
name: task-manager
description: 用户要求创建、查看或修订任务记录、纠正任务状态、调整已完成任务的父子关系、完成或放弃任务时使用；维护最小业务事实和结果更正历史，不执行研发、环境、验证或交付。
---

# 任务管理

本技能（Skill）提供`buildr.task-record/v3`：管理目标、范围、直接父子关系、独立状态、结果，以及本机复盘文档摘要和人的决定状态。任务记录通过产品动作维护，不直接编辑数据库。

## 普通任务

确认当前工作空间（Workspace）、任务标识、授权范围及真实目标，已有任务先 `task inspect`。`todo` 只保存尚未启动的意向，不执行环境或研发；`active` 表示已开始。子任务只用于可独立说明目标、范围及成果的交付，临时智能体分工不创建子任务。

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

写前重读当前版本；冲突后重新判断，不静默重放旧输入。完成只保存已成立的结果，不执行Git、部署、验证或清理。复盘正文由Agent按用户要求写入`.buildr/local/task-retrospectives/<task-id>.md`，Task Record只登记摘要与`pending-decision|decided`。

## 修订任务事实

已有 `task update` / HTTP `PATCH` 可以修改标题、目标、范围、规范引用、父子关系及四种合法状态；省略字段保持不变，不提交完整记录覆盖。所有非创建写入都必须提供当前 `recordDigest`；更正终态事实还需 `reason`，由智能体（Agent）准确说明已取得的用户决定，不为原因再创建审批步骤。

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
