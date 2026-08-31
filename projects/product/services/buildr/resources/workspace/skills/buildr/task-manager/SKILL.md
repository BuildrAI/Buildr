---
name: task-manager
description: 用户明确要求创建或查看待办/正式 Task Record、创建 Parent Task、更新顶层事实或复盘来源、激活待办、设置 Parent、完成或放弃 Task，或按 Task ID 恢复记录时使用；维护任务记录并指导轻量父子管理；不自行执行研发、环境、验证或交付。
---

# 任务管理

本技能（Skill）提供 `buildr.task-record/v2`：管理目标、范围、直接父子关系、独立状态、结果及复盘来源。任务记录通过产品动作维护，不直接编辑数据库或旧文件。

## 普通任务

确认当前工作空间（Workspace）、任务标识、授权范围及真实目标，已有任务先 `task inspect`。`todo` 只保存尚未启动的意向，不执行环境或研发；`active` 表示已开始。子任务只用于可独立说明目标、范围及成果的交付，临时智能体分工不创建子任务。

使用已有动作：

```text
buildr task create <id> --title <text> --intent <text> [--status todo|active] [--parent-task] [--parent <id>] [--project <code> ...] [--service <project/service> ...] [--change <project/change> ...] --target <workspace> --json
buildr task inspect <id> --target <workspace> --json
buildr task update <id> [--parent-task] [--parent <id>|--clear-parent] [set/add/remove flags] --expected-record <recordDigest> --target <workspace> --json
buildr task activate <id> --target <workspace> --json
buildr task complete <id> --summary <text> [--no-change] --expected-record <recordDigest> [--parent-completion <json-file>] --target <workspace> --json
buildr task abandon <id> --reason <text> --target <workspace> --json
```

任务说明引用已登记项目文档时使用具名的工作空间相对 Markdown 链接，例如 `[方案](projects/product/docs/plan.md)`。区分链接可解析与正文可读取；文档只在隔离目录时如实说明，不复制正文冒充已交付。

写前重读当前版本；冲突后重新判断，不静默重放旧输入。完成只保存已成立的结果，不执行 Git、部署、验证或清理。复盘来源仍只引用已有当前复盘的已结束任务，不复制报告。

## 父子管理

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

说明实际改变的对象、当前状态、成果与必要遗留；不要把记录成功称为业务交付成功。任务已完整结束时明确报告完成。完成或放弃后可询问是否进行任务复盘，重点包括执行耗时、重复尝试和人机协作效率；词元（Token）数据只记录实际可取得内容。该提示非阻塞，只有用户明确同意后才使用 `task-retrospective`。
