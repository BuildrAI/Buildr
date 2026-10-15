# 专业命令与结果

先读取 `buildr connection-skill --help` 和所选实例的程序帮助。通用入口负责绑定与上下文；以下参数由 Nacos 专业命令行接口（CLI）定义。参数示例只使用占位符，不携带认证。

| 命令 | 参数与结果 |
| --- | --- |
| `test` | 登录、选定命名空间（Namespace）可见性及一页配置读取；不发布，结果列明实际验证范围 |
| `namespaces` | 返回真实编号和名称，以及页面动态选项 `options: [{value, label}]` |
| `list` | `--data-id`、`--group` 可过滤；`--page` 默认 1，`--page-size` 默认 20、最多 100；只返回当前页及真实分页元数据 |
| `get` | 必须 `--data-id`，可 `--group`、`--output-file`；完整原文写受限本机新文件，结果返回 `outputFile`、完整摘要、目标、格式、元数据（Metadata）及 `expectedRevision` |
| `diff` | 必须 `--data-id`；选择 `--content-file <file或->` 或 `--compare-context <明确注入的名称>`；后一种可指定 `--compare-data-id`、`--compare-group` |
| `publish` | 必须 `--data-id`、`--content-file`、`--expected-revision`、`--expected-md5`；生产实际发布还需 `--authorization-file` |

默认分组（Group）为实例的 `defaultGroup`，默认命名空间（Namespace）为 `public`；网页显示名不能代替真实 `namespaceId`。不要根据环境名称改写生产标识。`apiVersion: auto` 仅按明确不存在的接口继续协商，认证拒绝不尝试另一账号。

读取原文时保留字节顺序标记（BOM）、换行、空白和完整标识，内容最多 4 MiB。`--output-file` 不覆盖已有文件。原文不作为普通日志回显；本机产物（Artifact）用于后续编辑及摘要，脱敏文本不能用作发布候选。不要将连接认证写入提示词（Prompt）或任务（Task）正文。

`diff` 返回 `equal`、两份完整内容摘要、有界差异及 `authorizationScope`。差异展示最多 200 行和 32 KiB，并明确 `truncated`；截断只影响展示。双实例比较必须由通用入口明确注入第二上下文，不能只提供显示名或让程序自行取得另一密码；两端认证各自使用。

生产授权文件为 `{source, statement, scope}`：`source` 指向真实用户指令来源，`statement` 保留此次授权原意，`scope` 精确采用本次 `diff.authorizationScope`。该范围包含工作空间（Workspace）、实例及版本、命名空间（Namespace）、分组（Group）、`dataId`、格式 `type`、旧 MD5 和完整新内容 SHA-256。不要伪造来源、修改范围或把普通实施授权包装成生产授权。

候选与授权可以分别来自文件或标准输入（stdin），但不能同时占用同一标准输入。程序核对本机上下文、远端完整正文与格式后才写入；同内容返回 `unchanged: true`，不发布、不消费授权。一次实际生产发布尝试消费一次依据；失败、超时或未知结果不恢复使用资格。

原生比较并交换（CAS）在确认兼容时使用；其他可用路线采用写前再次读取管理详情。结果的 `concurrencyProtection` 分别为 `native-cas` 或 `preflight-recheck`，后者仍有最后读取与写入间的竞争窗口。原生新增或更新语义（Upsert）也不能保证并发删除后不重建配置。两种路线都保留当前格式与元数据（Metadata），不因缺少原生能力单独阻止合法普通发布。

| 结果 | 接续判断 |
| --- | --- |
| `published: true, verified: true` | 发布已受理且回读正文一致；`serviceReloaded: false`，仍需按目标调查服务（Service）加载及业务效果 |
| `published: true, verified: false` | 保留已发布事实，查看 `verificationError` 并调查当前内容，不能当作未执行重发 |
| `nacos_publish_outcome_unknown` | 不知道请求是否生效；先读取准确目标的实际内容、核对记录及候选，必要时再取得新的生产授权 |
| 内容、格式或本机观察冲突 | 未提交相关请求；重新观察与比较，不静默覆盖 |

测试与发现只证明所列读取能力。模拟测试通过不等于真实系统、所有服务器版本、生产权限或业务目标已验证。
