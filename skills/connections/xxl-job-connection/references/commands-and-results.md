# 命令与结果

下列为传给所选连接 `run` 的专业参数；外层命令始终携带准确实例及观察版本。不要再传旧 `--connection` 或 `--target`；工作空间和认证只来自私有上下文。程序帮助以 `--help` 返回当前命令。业务标准输入（Standard Input）供候选、参数或授权文件使用，每次至多一个文件用 `-`。

| 动作 | 参数及结果 |
| --- | --- |
| `test` | 登录并最多读取一个执行器；返回 `status/checks/diagnostics/limitations/observedAt`，未操作任务 |
| `executors` | 可选 `--app-name`、`--offset`、`--limit`（1–100）；仅一页，`options[].value` 为文本编号 |
| `resolve` | `--service`、真实 `--app-name`；核实唯一对象，返回 `expectedRevision/expectedBindingRevision` 和现有关联，不保存 |
| `bind` | 同上，加两个观察版本；首次 `--expected-binding-revision absent`；只改变本机专业关联 |
| `jobs` | `--service`，可选 `--description/--handler/--author/--status/--offset/--limit`；一页任务及 `hasMore` |
| `get` | `--service --job`；当前配置及 `expectedJobRevision` |
| `prepare` | `--service --action`；已有任务带 `--job`，创建或更新带 `--job-file`，触发可带 `--executor-param-file`；返回候选、差异、观察版本和 `authorizationScope`。`diff` 是别名 |
| `create` | `--service --job-file --expected-revision`；创建停止的 BEAN 任务 |
| `update` | `--service --job --job-file --expected-revision --expected-job-revision`；只改候选字段 |
| `start/stop/trigger` | `--service --job --expected-revision --expected-job-revision`；触发可带 `--executor-param-file` |
| `logs` | `--service`；可选任务、状态、分页和成对起止时间，返回调度及执行状态 |
| `log` | `--service --job --log`；可选 `--from-line/--max-lines/--max-bytes`，返回正文、可用性、结束和截断状态及 `nextFromLine` |
| `preview` | `--service --schedule-type NONE\|CRON\|FIX_RATE --schedule-conf`，NONE 使用空配置；由调度中心计算下次时间 |

生产实际写入附加 `--authorization-file <受限本机文件>`，格式 `{source,statement,scope}`；`scope` 精确取当前 `prepare.authorizationScope`，不能编辑字段绕过范围检查。普通用户授权仍由智能体（Agent）依据当前任务取得，`production: false` 不自动授权业务写入。

创建候选只含可编辑字段：必需 `jobDesc/author/executorHandler`；可选 `alarmEmail/scheduleType/scheduleConf/executorParam/executorRouteStrategy/executorBlockStrategy/executorTimeout/executorFailRetryCount/misfireStrategy/childJobId`。更新可提供其中任意子集，未知字段拒绝；不接受 `glueType/glueSource/triggerStatus` 覆盖。运行参数最多 512 个字符，允许换行；空参数文件表示本次空值，未提供表示沿用当前完整参数。

时间筛选为调度中心当地 `yyyy-MM-dd HH:mm:ss`，起止必须同时给出且有序；未知远端时区就先确认，不能传本机换算值冒充正确。日志行数最多 1000，正文最多 256 KiB，远端响应及专业输出各最多 4 MiB；较大远端日志仍可能先触及上游限制。使用 `nextFromLine`，不能在失败或未输出完整一行时跳过内容。

`submitted/created/updated` 说明请求或管理记录效果；`verified` 说明本次回读，`executionObserved/executionSucceeded` 说明本次是否观察业务运行。触发返回 `executionObserved: false`、`executionSucceeded: null`，不制造运行编号。`status: unknown`（或未知写入错误）表示不能确认远端结果：先 `jobs/get/logs` 调查，再决定是否需要新的用户授权与尝试，不盲目重发。

未连接、缺依赖、认证拒绝、目标变化、未完整遍历和真实不存在分别诊断。遇到关联目录锁残留先核实没有运行占用并保留现场，不自动删除锁或覆盖本机状态。其他实例的认证、关联及授权记录不会被程序读取或接管。停用、缺依赖及连接变化不删除实例或既有专业状态。
