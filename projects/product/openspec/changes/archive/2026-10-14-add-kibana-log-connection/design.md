## Context

动机与能力范围见 [proposal.md](proposal.md)。以下为拟议实现，不是当前已交付能力。

当前事实：

- `ConnectionsApplication` 统一持有连接仓库（Repository）、提供者（Provider）选择和认证绑定；`ConnectionProvider` 已按 MySQL/Nacos 提供可选专业操作，连接公共字段不是数据库模型。
- `ConnectionsPage.tsx:44` 已预留 `logs: '日志系统'`，因此新增类型使用 `logs/kibana`，不另建 `logging` 别名或类别迁移。
- Nacos 专业操作主要通过命令行接口（CLI）提供，网页只管理连接并打开原网站；Kibana 沿用这个边界。
- 2026-10-14 的授权测试环境探索证明：Kibana 8.5.1 接受基本认证（Basic Auth），Node.js 原生 `fetch` 可读取视图并调用 `/internal/search/es`；服务、关键字、文本调用链关联和分组统计均已得到真实结果。此次仅为有界探索，不作为未来产品实现的测试证据。
- 同一视图的部分字段汇总类型包含 `text` 与 `keyword`，当前样本精确匹配使用 `.keyword` 才得到结果；`trace.id` 存在于字段列表但样本未填值。不能将字段目录等同于文档实际内容。
- 仅验证测试环境；未访问生产。客户地址、账号密码、原始日志和真实视图编号不进入本变更或随包资产。

## Goals / Non-Goals

**Goals:**

- 给能执行 Buildr 命令的不同智能体（Agent）提供相同、可组合的日志工具；目标理解、查询组合、诊断和后续处置判断仍由智能体（Agent）承担。
- 一个环境可配置多个连接（Connection）；所有入口基于同一连接编号、本机认证与当前远端视图工作，结果足以复查真实目标和查询范围。
- 以现有 `connections` 模块承接新增能力，仅隔离 Kibana 协议与查询语义，不建立未来所有日志平台的通用框架。

**Non-Goals:**

- 不新增日志存储、采集器、独立控制台、后台巡检或自动告警，不将问题处理变成固定流水线。
- 不依赖浏览器操作（Computer Use）、额外模型上下文协议（MCP）服务或 Elasticsearch 直连地址。
- 不提供日志写入、删除、索引管理、任意远端请求、业务重启或自动修复；不把配置连接视为上述动作授权。
- 首版不支持单点登录（SSO）、浏览器会话凭据（Cookie）导入、完整 Kibana 查询语言（KQL）、任意查询表达式（Query DSL）、脚本字段、运行时字段（Runtime Field）执行或深分页。

## Decisions

### 1. 在既有连接层扩展专业能力

| 对象 | 唯一职责 | 本次处理 |
|---|---|---|
| `ConnectionRecord` / `ConnectionRepository` | 工作空间（Workspace）连接身份、配置、版本和本机认证 | 复用，不另建日志记录表，不缓存远端日志 |
| `ConnectionsApplication` | 公共连接维护、认证解析和类型选择 | 注册 `createKibanaProvider()`，装配 `kibana` 专业应用，增加草稿视图发现方法 |
| `KibanaLogsApplication` | 根据连接与查询输入解析实际范围，返回受控结果 | 新增；从父应用注入连接访问解析，不直接持有第二份仓库或密码存储 |
| Kibana 提供者（Provider） | 目标解析、远端元数据、协议请求、查询构造及响应转换 | 新增；只向已确认目标发出固定只读操作 |
| 命令行接口（CLI） | 参数、文件或标准输入解析，结构化输出 | 在 `connection kibana` 下扩展，调用同一专业应用 |
| Buildr Web | 连接配置、视图选择和打开原网站 | 复用现有页面，不提供日志查询面板 |
| Buildr 技能（Skill） | 主动发现连接、按事实选择条件、解释结果及继续调查 | 扩展现有外部连接指引，不保存固定调查状态 |

代表调用链：`connection kibana search` → `KibanaLogsApplication.search` → 已绑定连接访问 → `ConnectionProvider.kibana` → 同一 Kibana → Elasticsearch → 有界且经敏感信息处理的结果。

选择类型内扩展而不建立独立日志模块，是因为身份、认证、环境与发现入口已经由连接（Connection）拥有；只有第二种日志类型出现真实共同语义时，再评估跨类型抽象。

### 2. 配置身份、网站与视图

公共字段保持 `name/category/type/environment/config`，固定 `category: logs`、`type: kibana`。专用配置采用：

| 字段 | 含义 |
|---|---|
| `consoleUrl` | 用户粘贴的 Kibana 网站地址，保存规范化的原网站入口 |
| `username` | 基本认证（Basic Auth）用户名 |
| `dataViewId` | 默认数据视图（Data View）的真实编号；允许 `null` 以便先登记再发现 |

密码继续通过 `credentials.password` 进入本机加密存储；命令行接口（CLI）只接受现有受支持的文件或标准输入，不新增密码参数。

地址接受 HTTP/HTTPS 的站点基址或 `/app/discover` 页面，可包含反向代理前缀及 `/s/{spaceId}`。从已识别路径派生接口（API）基址，保留代理前缀与空间（Space）；不把 `origin` 当作完整基址。不识别的应用路径明确要求正确地址，不猜测 Elasticsearch 端口。拒绝网址内用户名密码，丢弃查询串和页面片段，避免把临时搜索条件或凭证当作连接配置；原网站入口只打开规范化 Discover 地址。

认证绑定覆盖规范化接口（API）基址、用户名及 `logs/kibana`。地址、协议、端口、代理前缀、空间（Space）或用户名变化时遵循原有重新提供认证规则；改名称、环境或默认视图不使认证失效。网络请求不跟随重定向，不关闭证书验证，不从 HTTPS 自动降级。显式填写 HTTP 时给出凭证和日志明文传输警告，但不把整个连接体系变成强制 HTTPS 门禁。

数据视图（Data View）的名称只用于显示，真实编号用于选择；每次查询重读所选视图的索引模式（Index Pattern）、时间字段、字段能力及展示排除 `sourceFilters`，并在结果中返回本次观察。不永久保存 `filebeat-*`、字段目录或视图名称作为第二权威。视图被删除或不可见时不按同名自动替换，不退回任意索引。首版仅支持普通 Elasticsearch 视图；专用 `type`、无时间字段、时间字段非普通 `date|date_nanos`、类型冲突或不能搜索/排序时，测试、搜索、统计返回局部不支持。视图与字段发现仍可用，不猜测 `@timestamp` 或删除时间条件。

`sourceFilters` 是字段展示排除，不是文档过滤或权限边界；默认展示和显式 `--fields` 都遵循当前排除，显式请求被排除字段时明确诊断。被排除的默认正文/字段保留未展示原因，仍可按可搜索字段过滤。保存搜索、Discover 页面查询和页面片段不自动继承，工具只采用本次输入条件，结果回显实际范围。

网站空间（Space）由地址确定；日志中的命名空间（Namespace）是字段过滤条件，两者都不等于数据视图（Data View）。视图限定本次工具的查询目标，不替代 Elasticsearch 原生权限，也不宣称它是服务端安全隔离。

### 3. 最小配置体验与接口

在统一抽屉（Drawer）增加“日志系统 · Kibana”：名称、环境、网站地址、用户、密码、默认数据视图（Data View）。先提供“读取数据视图”，再选择并测试；网络暂不可用或尚未选视图时仍可保存合法配置，但显示未验证或未选择，不宣称可查询。

草稿发现新增 `POST /api/v1/workspaces/{workspaceId}/connections/kibana/data-views`，输入复用 `ConnectionTestInput` 的结构与已保存连接版本校验；通过 `ConnectionsApplication.discoverKibanaViews(root, input)` 解析草稿或保留认证，调用专业提供者（Provider）。该调用不保存草稿、不改变连接版本、不返回日志；沿用本机会话与请求保护。界面修改地址或账号后丢弃旧发现结果，过期响应不得覆盖新草稿。

已有连接查询和维护仍走既有入口；`POST /connections/test` 对 Kibana 增加实际视图可读及最小查询验证。没有默认视图时给出 `kibana_data_view_required`，不返回虚假的 `ok: true`。测试只需最近 15 分钟、`size: 0`、不统计全量命中的读取，零命中不妨碍证明查询可执行。只有响应结构有效、`isRunning/isPartial/timed_out` 为假且分片无失败时，成功沿用公共 `ok/serverVersion/elapsedMs`，通过可选 `kibana` 专业结果返回视图身份、`searchVerified: true`、查询通道和警告；部分执行返回未完整验证诊断，不改变 MySQL/Nacos 返回值。

首版新增的网页接口（API）只服务配置发现；日志搜索与统计先通过命令行接口（CLI）开放，不为了对称而添加无人消费的网页查询接口（API）。网页、命令行接口（CLI）均调用已有连接应用，未来增加入口不复制查询逻辑。

### 4. 可组合的智能体工具

现有 `buildr connection list --json` 保持不变，智能体（Agent）从结果选择 `logs/kibana` 及目标环境，再明确传连接编号。新增命令如下，均支持 `--target` 和 `--json`：

| 命令 | 主要输入 | 输出 |
|---|---|---|
| `connection kibana views` | `--connection`；可选 `--name`、`--offset`、`--limit` | 当前地址下可见视图的编号、名称、索引模式（Index Pattern）、当前页与总数 |
| `connection kibana fields` | `--connection`；可选 `--data-view`、`--name`、`--offset`、`--limit` | 当前视图时间字段及匹配字段的类型、可搜索性、可聚合性、混合类型提示 |
| `connection kibana search` | `--connection`；下述查询条件 | 时间、选定字段、日志正文和可复查文档身份 |
| `connection kibana aggregate` | `--connection --field`；下述共同条件及 `--top` | 指定字段前若干项计数及统计限制 |

视图和字段发现默认返回 100 项、最多 500 项；按稳定编号或字段名排序，支持名称过滤和显式偏移，输出过滤后总数及 `limitReached`。每次重新观察，不承诺多次发现是同一快照；不自动遍历 7,000 多个字段填满上下文。

搜索与统计共同条件：

- `--data-view <id>` 显式覆盖本次默认视图，不写配置；未提供且默认值为空时只阻止依赖视图的动作，`views` 仍可用。
- `--since <duration>` 接受正数及 `ms|s|m|h|d`，或同时提供带时区的 `--from <ISO-8601> --to <ISO-8601>`；两种形式互斥。默认 15 分钟，每次最长 24 小时，起点必须早于终点；一次调用只解析一次当前时间，采用 `gte from/lt to`，结果回显实际 UTC 起止。日期纳秒（Date Nanoseconds）保留原文本精度，不用毫秒四舍五入伪造连续读取。
- `--service` 对应 `kubernetes.deployment.name`，`--namespace` 对应 `kubernetes.namespace`，`--contains` 对 `message` 做短语匹配，`--trace-id` 组合 `trace.id` 的精确匹配和 `message` 的短语匹配。缺少某个快捷字段时只拒绝相关条件，不能悄悄删掉条件扩大查询。
- `--filter-file <file|->` 接受 `{filters: [{field, op, value}]}`；`op` 仅为 `eq|match-phrase|exists`，`exists` 不带 `value`。最多 20 条，值为有界标量；与快捷条件共同按逻辑与（AND）组合。它允许智能体（Agent）依据实际字段调查非默认格式，无需新增连接配置；不接受原始查询表达式（Query DSL）、任意地址或脚本。
- 过滤输入总量不超过 64 KiB；字符串值最多 4 KiB，数值必须有限，字段名最多 1 KiB；未知键、重复参数、非标量和类型不匹配在请求前拒绝。远端字段必须存在且支持相应操作。`eq` 支持普通精确字符串、数值、布尔及 IP 字段，`match-phrase` 支持普通文本/关键词字段，`exists` 只支持普通可搜索叶字段；对象本身不作叶字段。依据 `subType.nested.path` 识别嵌套字段（Nested Field），首版对其过滤、统计或显式展示返回局部不支持；普通对象的叶字段仍可用。视图定义的脚本字段和运行时字段（Runtime Field）不复制执行，涉及它们的条件或显式展示返回局部不支持。

搜索另支持 `--limit`（默认 100、最多 500）、`--fields`（逗号分隔，最多 20 个普通字段）、`--order asc|desc`（默认降序）及 `--message-bytes`（默认 8 KiB、最多 256 KiB）。默认返回时间、`message`、`kubernetes.deployment.name`、`kubernetes.namespace`、存在的 `trace.id` 和 `log.level`；缺少非过滤展示字段保留缺失事实，不导致整条日志丢失。显式字段采用 Elasticsearch `fields` 参数读取映射值，保留数组、缺失及忽略值摘要；正文只从受限 `_source` 的 `message` 读取，不请求完整 `_source` 或 `fields: *`。`.keyword` 多字段（Multi-field）不在 `_source` 中，查询解析字段不能替代正文路径。日期字段要求纳秒兼容字符串格式，结果不擅自把多值压成一个标量。长堆栈可通过缩小范围、减少行数并显式提高正文上限继续读取，仍需标记剩余截断。

统计使用受控的词项统计（Terms Aggregation），`--top` 默认 10、最多 100，不返回日志正文；保留 `sum_other_doc_count`、`doc_count_error_upper_bound` 和远端执行状态，不把前几项当全部服务。首版不支持任意聚合树或自动递归查询。

例如，以下均为拟议命令：

```sh
buildr connection kibana search --connection <id> --service service-a --since 15m --contains ERROR --limit 50 --json
buildr connection kibana search --connection <id> --trace-id <observed-trace-id> --from <start-with-timezone> --to <end-with-timezone> --json
buildr connection kibana aggregate --connection <id> --field kubernetes.deployment.name --since 15m --top 10 --json
```

调用链关联不默认继承前次服务过滤，智能体（Agent）可在同一环境与有界时间内调查跨服务日志；如继续带 `--service`，结果仍只证明该服务范围。不将提取出标识或匹配关键字表述为找到根因或已经修复。

### 5. 协议适配、字段解析与结果可信度

选择原生 `fetch`，避免为了单一 Kibana 目标引入 Elasticsearch 直连客户端或整套社区模型上下文协议（MCP）服务。协议适配集中维护，命令行接口（CLI）不自行拼 URL 或查询正文。

| 远端路径 | 用途与边界 |
|---|---|
| `GET /api/status` | 尽力读取版本；状态权限不足不独立阻断已经可执行的查询 |
| `GET /api/data_views` | 获取当前空间（Space）可见视图摘要，不从该响应推断字段能力 |
| `GET /api/data_views/data_view/{id}` | 读取选定视图、时间字段和字段信息；真实 8.5.1 返回按字段名索引的字段字典（Field Dictionary），兼容受控数组形式并校验编号与键/名称一致，缺少必要目录时局部报告不兼容 |
| `POST /internal/search/es` | 固定 `params.index` 为所选视图当前索引模式（Index Pattern），执行工具构造的只读搜索或统计 |

目前以 8.5.1 真实探测及响应结构为首个兼容样本。其他版本只有在当前通道及结果结构验证成立时使用，输出实际版本或未知与查询通道；不以版本字符串单独决定全部可用性，也不承诺所有 8.x/9.x。Elastic 已宣布 9.0 起限制内部接口（Internal API），因此该路径不属于长期公开兼容承诺。通道不可用时返回版本/认证/权限/协议等具体诊断，不自动改走浏览器、开发控制台代理、其他环境或猜测的 Elasticsearch 地址，不添加冒充 Kibana 内部客户端的访问标头绕过限制。

8.5.1 的 `es` 策略是同步搜索，不创建异步搜索资源。固定请求 `POST`、`Content-Type: application/json`、`kbn-xsrf: true`，正文为 `{params: {index, track_total_hits: false, timeout: '5s', body}}`，覆盖 Kibana 默认的全量计数及分片超时；`body` 仅含受控 `query`、`size` 及必要排序/字段或统计，测试设置 `size: 0`。不提交 `id`、搜索会话（Search Session）或持久化选项，不切换到 `ese` 异步策略。响应验证 `{rawResponse, isRunning, isPartial}` 及 `rawResponse` 内部命中/统计、`timed_out`、`_shards`；必要结构缺失报告协议不兼容，不默认执行成功或静默丢弃包装。若未来协议意外返回仍在执行的结果，保留可用部分和诊断，不启动未知生命周期的轮询。`_shards.total: 0` 标记 `no_target_shards`，不能把没有可读目标分片当作已验证日志读取权限；连接测试给出未验证诊断，搜索保留实际响应和覆盖限制。

精确字段解析首先检查当前视图元数据的 `esTypes`、`searchable/aggregatable`、`subType` 和 `runtimeFieldMap`，不把展示型 `type: string` 当作实际映射：原字段单一 `keyword` 等精确类型时直接使用；文本字段有可用 `.keyword` 时选择该子字段并在结果中返回 `resolvedFields`。出现跨索引的混合映射时，使用可用精确候选但增加 `field_mapping_mixed` 覆盖警告，不向分析型原字段发送会产生词元误匹配的兜底 `term`，也不宣称历史所有索引均被覆盖；调用方可以显式指定字段或缩小到合适视图。找不到所需精确字段时明确失败，不能把它解释成零匹配。统计采用同一解析规则，并要求字段可聚合。

`--trace-id` 对存在且可搜索的结构化标识与正文路径构造逻辑或（OR）；结构化字段未填值不阻止正文命中。只有一个可用路径就使用该路径并回显；两个都不可用则明确失败。Kibana 查询语言（KQL）与 Elasticsearch 查询表达式（Query DSL）不同，本实现不把 KQL 字符串交给 `query_string` 冒充同义查询。

单次动作总时限 15 秒，搜索服务端 `timeout: 5s`；日志响应和最终输出各限制 4 MiB，视图元数据限制 8 MiB。累计字节限制作用于流式读取，超限即中止，不先读完再判断；超限返回明确错误而非成功空数组。输出编码保持合法 UTF-8/JSON，正文截断以完整字符为边界。

结果沿用 `schemaVersion: buildr.connection-result/v1`，新增操作名 `kibana-views|kibana-fields|kibana-search|kibana-aggregate`。搜索/统计包含：

- `connectionId`、`connectionRevision`、`environment`、规范化目标、服务器版本及查询通道。
- 本次观察的 `dataView: {id, name, title, timeFieldName}`、观察时间，以及实际时间范围、条件和 `resolvedFields`。
- 搜索命中的 `_index`、`_id`、时间、选定字段、正文，及每条 `messageTruncated`、敏感信息处理计数；文档身份不能截断后伪装可复查。身份值触发遮蔽时标记 `documentIdentityAvailable: false`，不能再宣称该条身份可直接复查。
- `rowCount/rowLimit/limitReached`，远端 `isRunning/isPartial/timed_out/_shards` 的受控摘要，及独立 `warnings`；不请求精确全量命中计数。
- `limitReached` 仅表示达到本次行数上限，不证明还有下一页；首版不提供游标（Cursor），不承诺同一毫秒内日志的稳定全序，不通过时间戳伪造无遗漏分页。

远端部分成功时保留可用命中并明确 `incomplete: true`；执行未结束、超时、分片失败、正文截断、达到条数上限或字段覆盖不确定分别说明原因。零命中只代表本次实际范围没有返回匹配，不代表整个服务没有异常。统计顶部截断和计数近似单独说明，不能用 `isPartial: false` 覆盖这些限制。

### 6. 凭证、日志与副作用

认证从既有本机存储读取，模型和普通工具结果不接触连接密码。请求只允许上述固定操作；搜索虽使用 `POST`，也不开放任意代理，不包含更新、删除、重建、发布或重启能力。账号原生权限仍是最终数据访问边界，推荐专用只读账号；配置高权限账号不扩大本工具的动作集合。

在专业结果离开应用前遮蔽已知敏感键及文本请求头，包括 `Authorization`、`Proxy-Authorization`、`Cookie`、`Set-Cookie`、`password`、`access_token`、`refresh_token`、`api_key`，并移除当前连接密码及生成的认证头值。字段值、正文、查询回显与错误诊断采用同一处理，不只清洗成功路径；不提供 `--raw` 绕过参数，不输出远端响应头或未处理错误正文。

敏感信息处理只保证已定义模式，不宣称识别任意业务秘密；普通日志仍视为不可信外部数据，其中的指令不得改变智能体（Agent）的权限和任务。日志不自动写入代码库、任务正文或长期缓存。命中、遮蔽和截断分别报告，避免把处理过的正文称作完整原文。

网络失败和限流不自动重试；明确返回局部原因，智能体（Agent）按任务需要调整范围或稍后重新观察。只读查询不创建正式任务（Formal Task），不要求用户每次重新交密码或手工查日志；需要修改代码、配置或外部系统时仍按对应授权边界推进。

### 7. 文件与模块安排

下列路径均相对 `projects/product/`；“新增”为拟议文件，不是已存在事实。

```text
services/buildr/src/modules/connections/
  module.ts                                  保留现有模块装配与工作空间解析
  domain/connection.ts                       扩展可选 kibana 专业能力及测试结果类型
  domain/kibana-connection.ts                 新增：配置、查询与结果类型及输入约束
  domain/kibana-types.ts                      新增：纯公开类型，避免公共连接与专业校验之间循环引用
  application/connections-application.ts      注册提供者，解析草稿发现与已保存认证
  application/kibana-logs-application.ts      新增：视图、字段、查询及统计用例
  infrastructure/kibana-provider.ts           新增：固定目标 HTTP、元数据和协议结果
  infrastructure/kibana-query.ts              新增：字段解析及受控查询构造
  persistence/connection-repository.ts        复用，不增加日志表或迁移
  interfaces/cli/connections-cli.ts           扩展帮助及 kibana 路由
  interfaces/cli/kibana-cli.ts                新增：参数解析和统一结果输出
  interfaces/http/connections-http.ts         扩展草稿视图发现，不复制专业逻辑
services/buildr-web/src/features/connections/
  connection-types.ts                        扩展 Kibana 类型及测试/视图返回类型
  kibana-connection-form.ts                   新增：草稿转换与规范网站入口
  components/KibanaConnectionFields.tsx       新增：网站与视图发现/选择状态
  components/ConnectionEditDrawer.tsx         复用公共字段、保存与测试动作
  api/connection-api.ts                      调用本机草稿发现接口
  connection-presentation.ts                 类型显示与范围搜索
  pages/ConnectionsPage.tsx                   增加 Kibana 地址、视图与打开网站操作
services/buildr/resources/runtime/skills/buildr/references/
  external-connections.md                    补日志调查的发现和使用方法
```

代表对象及方法为 `KibanaLogsApplication.views|fields|search|aggregate`、`createKibanaProvider()` 和 `ConnectionsApplication.discoverKibanaViews()`；仅在跨入口共享的公开类型放入领域文件。查询构造独立是因为精确字段、输入边界和结果覆盖具有独立测试价值；不为每个动作再拆一层转发对象。

### 8. 知识影响与验证安排

当前知识评估（Current Knowledge Assessment）：实现将影响 `knowledge/docs/architecture/technical.md`、`knowledge/code-map/system-services-assets.md`、`knowledge/code-map/technical-layers.md` 及其 `knowledge/index.yml` 来源关联。实施清单包含这组已有成果的有界校准；本轮不提前写成当前能力，不要求另建连接专题或独立技术图（Technical Diagram）。产品总览把外部连接笼统放在未来方向的旧表述仅作后续局部校准，不扩大成全量知识整理。

方案审查（Planning Review）需要核对类别身份、字段兼容、隐私、查询与配置边界；本轮完成材料后进行。实现审查（Implementation Review）和运行验证留到真实代码形成，不用规划检查冒充功能验收。知识影响评估已依据上述三份已有成果及当前 `connections` 实现核对；本轮没有实现事实变化，保留知识正文，仅把有界校准写入实施清单，未采用第二份影响清单。

后续直接验证覆盖：配置解析、凭证绑定与重定向、视图变化、无效时间字段、嵌套/运行时字段、字段混合类型、缺失字段、`.keyword` 展示、`sourceFilters`、调用链文本回退、时间/条数/字节上限、部分结果、敏感信息处理、命令帮助与返回结构；回归现有 MySQL/Nacos。前端验证覆盖新增/编辑、空密码保留、视图发现失败、过期响应、测试失败和原网站打开，保留现有菜单、过滤与 MySQL 查询。

真实测试采用已授权的测试连接，先只读查询，再核对同一字段/范围/文档身份；不向测试代码写入客户凭证，不默认访问生产。命令行接口（CLI）/网页冒烟检查（Smoke Test）沿用既有隔离执行器；浏览器验收（Browser Verification）遵循 `buildr-dev-preview` 和正式构建产物要求。

## Risks / Trade-offs

- 内部接口（Internal API）升级可能变化 → 以当前能力与响应结构验证，不盲目宣称版本范围；失败只影响该 Kibana 动作，不切换到另一目标。
- 混合字段映射可能遗漏部分历史数据 → 返回实际字段和覆盖警告，支持显式字段/视图选择，零结果不等于故障不存在。
- 窄时间与有限行数可能看不到根因 → 明确返回范围和限制，支持智能体（Agent）主动调整；不自动遍历所有日志增加外部负载。
- HTTP 明文及高权限账号暴露风险 → 配置和工具返回警告、推荐 HTTPS 与只读身份，不静默升级/降级或把本地规则当远端权限。
- 日志可能包含秘密或恶意指令 → 固定敏感模式遮蔽、受控输出、不自动持久化，明确遮蔽并非全能。
- 仅验证一个真实版本 → 用可控响应测试错误路径，其他部署在配置时验证；不把生产未知变成测试环境接入的阻塞。

## Migration Plan

增量注册 `logs/kibana`，复用现有 SQLite 连接与加密认证格式，不更改既有 MySQL/Nacos 数据。现有用户升级后可选择新类型；用户自行配置每个环境，产品不预置客户地址、视图或认证。需要回退时停止新增类型操作并保留连接及认证，旧版本遇到未支持类型仍按现有边界报告不支持，不改写成其他类型或删除外部数据。

## Open Questions

生产部署的实际版本、可用传输方式、字段映射及账号权限，留到用户配置该连接时核验；这些未知不改变当前查询通道及显式局部诊断的设计。没有需要通过猜测补齐的客户配置。

## References

- [Kibana 官方内部接口限制](https://www.elastic.co/docs/release-notes/kibana/breaking-changes)：9.0 起限制内部 HTTP 接口访问。
- [Kibana 8.5 请求标头](https://www.elastic.co/guide/en/kibana/8.5/api.html)：基本认证（Basic Auth）及 `kbn-xsrf` 请求约定。
- [8.5.1 同步搜索策略](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data/server/search/strategies/es_search/es_search_strategy.ts)、[响应包装](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data/server/search/strategies/es_search/response_utils.ts)、[默认参数](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data/server/search/strategies/es_search/request_utils.ts)：固定 `es` 通道及显式关闭全量计数。
- [8.5.1 单视图读取](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data_views/server/rest_api_routes/get_data_view.ts)、[视图模型](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data_views/common/data_views/data_view.ts)、[字段元数据](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data_views/common/fields/data_view_field.ts)：时间、真实字段类型及嵌套字段（Nested Field）身份。
- [多字段（Multi-field）](https://www.elastic.co/guide/en/elasticsearch/reference/8.5/multi-fields.html)、[字段取值](https://www.elastic.co/guide/en/elasticsearch/reference/8.5/search-fields.html)、[展示排除实现](https://github.com/elastic/kibana/blob/v8.5.1/src/plugins/data/common/search/search_source/search_source.ts)：查询字段与正文取值边界。
