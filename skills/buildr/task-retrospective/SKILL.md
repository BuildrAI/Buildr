---
name: task-retrospective
description: 用户明确要求复盘已完成或已放弃的正式Task，查看本机复盘文档，或在阅读后决定是否继续行动时使用；只基于当前可见事实生成本机Markdown并维护Task上的待决策/已决策状态。
---

<!-- buildr:capability-bindings begin -->
## Buildr Capability Bindings

Consumer readiness: `ready`. `ready`只表示结构可路由。

- `buildr.task-record@3` — mode `required`, readiness `ready`, reason `none`
  - contract: `skills/contracts/buildr/task-record/v3.md`
  - provider: `task-manager` → `.agents/skills/task-manager/SKILL.md` (scope `.`)

执行provider-dependent action前，读取上面已解析的contract与provider；成功仍由contract要求的授权和结果证据判断。
<!-- buildr:capability-bindings end -->

# 任务复盘

任务复盘帮助人和Agent从已经结束的工作中发现执行浪费、等待、重复、错误恢复和协作问题。Agent负责分析并生成文档；Task Record只记录当前本机文档版本是否仍等待人的决定。

## 1. 核对真实对象

确认canonical Workspace、正式Task ID和当前Task Record。Task 必须是 `completed` 或 `abandoned`；进行中的工作可以讨论改进，但不登记为终态任务复盘。

只读取当前真正可达且与复盘相关的最小事实：Task目标与结果、当前会话工具结果、Git、代码、测试、适用Review/Verification、CI或外部业务结果。已有本机文档只是调查线索，继续判断前重新核对当前事实。

## 2. 生成自由Markdown

重点检查 Agent 执行时间、token 消耗、重复尝试、人机协作或 Buildr workflow/harness 效率。报告使用自由Markdown，不要求评分、固定分类、行动项或确定性流程候选。

明确区分：

- 已观察事实；
- 基于事实的推断；
- 当前缺失的数据。

Token、完整耗时或调用次数不可得时直接标记缺失并继续分析。不得声称读取隐藏推理、完整对话、完整工具日志或后台事件，不为补齐数字回放上下文、强制估算或新增采集。

用户明确授权生成文档后，把完整报告写入固定本机路径：

```text
.buildr/local/task-retrospectives/<task-id>.md
```

该文件不进入Git、SQLite正文、发布物或Current Knowledge。先安全写入完整文件，再计算实际SHA-256；文件写入失败时不登记Task状态。

## 3. 登记当前文档

重新读取Task取得当前`recordDigest`，执行：

```text
buildr task update <task-id> --retrospective-state pending-decision --retrospective-document-digest <sha256-digest> --expected-record <recordDigest> --target <workspace> --json
```

Application会重新读取固定文件并校验Task终态、普通文件、非符号链接、正文、大小、摘要和Task版本。登记失败时保留已生成文件，只恢复登记；不得重做已完成的复盘。

## 4. 查看与决定

用户只要求查看时，读取当前Task和固定Markdown并直接展示；查看零写入，不自动标记已决策。

用户明确决定继续行动时，先核对现有普通Task，复用匹配todo/active Task或展示将创建的普通Task effects并取得授权。普通Task可以在目标中引用来源Task或本机复盘路径；不建立专用来源关系。

用户明确完成决定后，重新读取Task和文档摘要，再执行：

```text
buildr task update <task-id> --retrospective-state decided --retrospective-document-digest <sha256-digest> --expected-record <recordDigest> --target <workspace> --json
```

`decided`只表示人已决定是否继续行动，不表示改进已经实施。用户决定不行动时不创建Task，也不保存`no-action`说明。

文档内容变化或重新生成时，重新登记为`pending-decision`。只有用户明确要求解除关联时，才使用`--clear-retrospective`；该动作不删除Markdown。

## 5. 边界

本Skill不参与Task完成、交付、cleanup或OpenSpec门禁，不自动提示、生成、批量处理或关闭复盘。复盘建议不自动修改Rule、Skill、Application、CLI、测试或工作流；需要继续行动时使用普通Task和对应专业能力。
