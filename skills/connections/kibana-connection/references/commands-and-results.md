# 专业命令与结果

先通过 `buildr connection-skill list --json`、`get --connection <id> --json` 选择准确实例。调用前核对目标、环境和当前 `revision`，再经通用入口读取帮助及执行：

```sh
buildr connection-skill help --connection <id> --program cli --json
buildr connection-skill run --connection <id> --expected-revision <revision> --program cli -- views --limit 100
buildr connection-skill run --connection <id> --expected-revision <revision> --program cli -- fields --data-view <view-id> --name kubernetes
buildr connection-skill run --connection <id> --expected-revision <revision> --program cli -- search --data-view <view-id> --from 2026-10-15T10:00:00+08:00 --to 2026-10-15T10:10:00+08:00 --service <observed-deployment> --namespace <observed-namespace> --limit 50 --result-file /absolute/new-result.json
buildr connection-skill run --connection <id> --expected-revision <revision> --program cli -- aggregate --field log.level --since 15m --top 10
```

占位须换成本次观察值；不把实例列表顺序、文件名或另一实例编号当作绑定。命令不接收认证，实例另由 Buildr 提供完整组。参数中的业务标识也可能敏感，必要时用受限过滤文件输入条件。

| 命令 | 作用及限制 |
| --- | --- |
| `views` | 当前账号可见的数据视图（Data View）；`--name` 本地名称过滤，`--offset`、`--limit` 分页，默认 100、最多 500 项。 |
| `fields` | 重新读取选定视图身份、索引匹配、时间字段及映射能力；支持同样的名称过滤与分页。 |
| `search` | 默认最近 15 分钟、100 条、倒序、正文 8 KiB；可显式选择字段和过滤，最多 500 条。 |
| `aggregate` | 按经过当前映射核验的字段分组，默认前 10、最多 100 项；不返回日志正文。 |
| `test` | 对默认视图执行零文档、零正文的有界同步查询；不保存认证或草稿，不读取日志正文。 |
| `discover` | 供表单发现最多 500 个可见视图；地址和完整认证齐备即可执行，不要求预先选择默认视图。 |

时间使用 `--since 15m` 或成对 `--from/--to`，二者不能混用；绝对时间必须带时区，相对单位为 `ms/s/m/h/d`，范围为正且最多 24 小时。搜索结果保留纳秒（Nanosecond）日期文本，不擅自四舍五入。

快捷条件 `--service` 对应 `kubernetes.deployment.name`，`--namespace` 对应 `kubernetes.namespace`，`--contains` 为 `message` 短语，`--trace-id` 按可用的 `trace.id` 精确字段及 `message` 短语关联。实际采用字段在 `resolvedFields` 返回；字段不存在、类型不支持或被排除时明确失败，不静默删条件。`.keyword` 仅在当前元数据证明可用时采用。

通用过滤使用 `--filter-file <file|->`：

```json
{"filters":[{"field":"log.level","op":"eq","value":"ERROR"},{"field":"trace.id","op":"exists"}]}
```

文件只含 `filters`，最多 20 条、64 KiB；操作为 `eq`、`match-phrase`、`exists`，最后一种不含 `value`。条件与快捷条件按逻辑与（AND）组合。业务标准输入（Standard Input）可用于 `--filter-file -`，与认证通道分开。

输出 `schemaVersion: kibana.connection-result/v1`，专业命令带 `operation`、`status`、实例观察、实际目标及结果。`status: success` 只代表本次已声明范围；不完整结果为 `unknown`，保留已取得数据。失败退出码非零，超时和连接中断亦不能解释为成功空结果。通用宿主外层退出成功也不能替代专业 `status` 与检查范围。

检索返回 `rows`、映射字段数组、文档 `_index/_id`、时间、忽略或缺失字段、正文截断事实；正文被视图排除时仍保留已命中文档。`execution` 分别报告运行中、部分结果、超时及分片（Shard）计数。`incompleteReasons` 独立说明条数到顶、正文截断、分片（Shard）失败、无目标分片（Shard）、混合映射等限制。聚合（Aggregation）另报其他分组计数与误差上界，顶部结果不能作为全量精确统计。

元数据响应最多 8 MiB，搜索响应及最终专业输出最多 4 MiB；不进行后台轮询或自动重试。通用宿主还可能限制展示输出，较大结果应预先指定 `--result-file <new-file>` 并直接读取该文件。文件在网络请求前独占创建，权限为 `0600`，父目录须已存在；已有文件不覆盖。文件保存失败单独报告，不否定已成立的只读请求结果。

程序遮蔽当前密码、认证头、常见敏感键和请求头文本，再按完整字符截断正文；无法识别任意业务秘密。文档身份若被遮蔽则 `documentIdentityAvailable: false`，不能拿展示值定位原文。结果文件同样遮蔽；需要原文时按既有权限使用原网站，不能从隐藏文本猜回秘密。新增视图选项的身份需遮蔽时，本次发现明确失败，不交付改变后的编号。

零命中只能说明本次目标、过滤和时间内未取得命中。先复查环境、视图、当前字段、采集延迟与时间边界；需要改变范围时说明新范围，不自动扫描其他环境。业务恢复须另有请求成功、健康状态或其他实际证据，不能由日志查询退出码推断。
