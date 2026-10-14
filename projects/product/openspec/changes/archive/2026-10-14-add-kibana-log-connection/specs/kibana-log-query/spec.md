## Purpose

让不同智能体（Agent）复用工作空间（Workspace）中按环境配置的 Kibana 连接，在明确目标、认证、数据视图（Data View）和时间范围内发现字段、只读查询与统计日志，并依据可复查且说明限制的结果继续调查服务问题，减少人工转述日志上下文。

## ADDED Requirements

### Requirement: Kibana 目标解析与认证绑定

系统 SHALL 接受 HTTP/HTTPS 的 Kibana 基址或 Discover 地址，保留反向代理前缀和网站空间（Space），规范化原网站入口并丢弃查询串和页面片段。系统 MUST 拒绝带网址内认证、无法确定基址或不支持协议的地址，不猜测 Elasticsearch 地址。基本认证（Basic Auth） SHALL 复用本机加密存储并绑定 `logs/kibana`、规范化接口（API）基址和用户名；改变协议、主机、端口、前缀、空间或用户名 MUST 重新提供认证，不向新目标发送旧认证。请求 MUST 不跟随重定向、不关闭证书验证、不自动降级传输；显式 HTTP SHALL 显示明文传输警告。

#### Scenario: 保留非默认网站空间
- **WHEN** 用户配置包含代理前缀及 `/s/{spaceId}/app/discover` 的地址
- **THEN** 工具向同一前缀和空间（Space）执行请求，原网站入口不带临时搜索条件或认证

#### Scenario: 修改认证目标
- **WHEN** 已保存连接改变空间（Space）或用户名但未提供新认证
- **THEN** 操作在发送认证前明确失败；仅改变名称、环境或默认视图不使认证失效

#### Scenario: 远端要求重定向
- **WHEN** Kibana 请求收到重定向响应
- **THEN** 工具报告目标或认证诊断，不把凭证发送至跳转地址

### Requirement: 当前视图身份与有界发现

系统 SHALL 提供 `connection kibana views` 和 `connection kibana fields`，均要求连接编号并支持 `--target`、`--json`、名称过滤、偏移和条数。发现默认返回 100 项、最多 500 项，视图按编号、字段按名称稳定排序，返回过滤后总数及 `limitReached`；多次调用 SHALL 不宣称同一快照。默认 `dataViewId` SHALL 允许为空；字段、查询和统计 SHALL 使用显式 `--data-view` 或默认编号，每次重读当前视图的索引模式（Index Pattern）、时间字段和字段能力，不把缓存名称或索引模式当权威。视图不存在、不可见或必要元数据不能核实时 MUST 局部失败，不按同名替换或扩大到任意索引。首版 SHALL 只查询普通 Elasticsearch 视图，其他专用类型返回局部不支持；发现仍能说明可见视图及类型。

#### Scenario: 尚未选择默认视图
- **WHEN** 连接已保存但默认视图为空
- **THEN** `views` 仍可执行；依赖视图且未传 `--data-view` 的动作返回 `kibana_data_view_required`

#### Scenario: 默认视图被删除
- **WHEN** 用户或工具使用已删除的视图编号
- **THEN** 返回明确诊断，不改用同名视图或其他索引

#### Scenario: 字段目录很大
- **WHEN** 当前视图拥有数千字段而调用方只读取默认页
- **THEN** 输出限定条数及匹配总数，不自动读取所有页填满上下文

### Requirement: 显式时间范围与真实时间字段

搜索和统计 SHALL 接受互斥的 `--since <duration>` 或同时提供带时区的 `--from`、`--to`，相对时间接受正数及 `ms|s|m|h|d`，默认最近 15 分钟，范围必须为正且最多 24 小时。系统 SHALL 一次解析当前时间，并回显实际 UTC 起止；采用包含起点、不包含终点的范围。视图时间字段 MUST 为可搜索且可排序的普通 `date` 或 `date_nanos` 字段；缺失、类型冲突、不支持或必须执行脚本时 SHALL 返回局部不可查询，不隐式改用 `@timestamp` 或删除时间条件。

#### Scenario: 提供无时区的起止时间
- **WHEN** 调用方提供没有时区的时间、颠倒范围、超限范围或同时提供两种时间形式
- **THEN** 工具在远端查询前拒绝输入，不自行解释服务器本地时间

#### Scenario: 视图没有合适时间字段
- **WHEN** 所选视图没有时间字段或时间字段为不支持类型
- **THEN** 搜索、统计和最小查询测试明确失败，视图发现仍可用

### Requirement: 受控过滤与字段兼容

搜索和统计 SHALL 支持 `--service`、`--namespace`、`--contains`、`--trace-id`；前三者分别针对 `kubernetes.deployment.name`、`kubernetes.namespace`、`message`。通用 `--filter-file <file|->` SHALL 接受 `{filters: [{field, op, value}]}`，最多 20 条且总输入最多 64 KiB，`op` 仅为 `eq|match-phrase|exists`，`exists` 不带值；其他值为有界标量，字符串最多 4 KiB，字段名最多 1 KiB，数值必须有限。未知键、重复参数或类型不匹配 MUST 在请求前拒绝。通用条件与快捷条件 SHALL 按逻辑与（AND）组合，不接受原始查询表达式（Query DSL）、脚本、任意地址或索引覆盖。

系统 MUST 依据实际字段映射及能力检查操作。精确匹配和统计 SHALL 使用兼容的普通精确类型或可用 `.keyword` 子字段，并回显 `resolvedFields`；分析型文本字段不得通过词项查询冒充完整值精确匹配。映射混合时 SHALL 返回覆盖警告，不宣称所有历史索引均被覆盖。缺少条件字段、不支持的嵌套字段（Nested Field）、脚本字段或视图运行时字段（Runtime Field） MUST 明确拒绝相关动作，不静默丢弃条件或把不支持解释为零匹配。

#### Scenario: 服务字段为文本与关键词混合映射
- **WHEN** 用户按服务精确查询，原字段不具备统一精确类型但有可用 `.keyword`
- **THEN** 工具使用该子字段，回显实际字段和覆盖限制，不对分析型原字段做精确兜底

#### Scenario: 调用方指定不存在的命名空间字段
- **WHEN** 当前视图不能执行某个明确提供的过滤条件
- **THEN** 仅该动作明确失败，不删除条件后返回扩大范围的日志

#### Scenario: 条件指向嵌套字段
- **WHEN** 通用过滤需要嵌套查询语义而首版无法支持
- **THEN** 返回字段不支持的具体原因，不构造可能产生错误零结果的普通过滤

### Requirement: 调用链标识的结构化与正文关联

`--trace-id` SHALL 对存在且支持精确匹配的 `trace.id` 与支持短语匹配的 `message` 构造逻辑或（OR），结构化字段未填值不得妨碍正文命中。只有一个可用路径时 SHALL 使用该路径并回显；两者均不可用时 MUST 明确失败。工具 SHALL 不隐式继承前次服务条件，技能（Skill）指引 SHALL 说明跨服务关联、实际范围和正文关联的证据限制，不把匹配关键字宣称为根因或修复完成。

#### Scenario: 标识只出现在日志正文
- **WHEN** `trace.id` 存在于字段目录但文档未填值，`message` 含关联标识
- **THEN** 正文路径可以返回命中，并说明本次采用的关联路径

#### Scenario: 调查跨服务调用链
- **WHEN** 智能体（Agent）只指定标识和时间范围查询同一环境
- **THEN** 工具不附加前次服务过滤；显式指定服务时仍说明结果仅覆盖该服务

### Requirement: 有界日志输出与文档复查

`connection kibana search` SHALL 支持 `--limit` 默认 100、最多 500，`--fields` 最多 20 个普通字段，`--order asc|desc` 默认降序，以及 `--message-bytes` 默认 8 KiB、最多 256 KiB。默认展示时间、正文、服务、命名空间（Namespace）及存在的 `trace.id`、`log.level`；缺少非过滤展示字段 SHALL 保留缺失事实而不删除该命中。展示 SHALL 遵循当前视图的 `sourceFilters` 排除，显式请求被排除字段返回诊断，默认字段被排除时说明未展示原因；展示排除不得被当成文档过滤或权限边界。映射字段取值 SHALL 保留数组、缺失和忽略值事实，不通过 `.keyword` 的源路径错误判断字段缺失，不以查询解析字段替代原正文路径，不请求所有字段或完整源文档。每条日志 SHALL 返回可复查的 `_index`、`_id`、时间及实际字段，保留日期文本精度；正文截断 MUST 保持完整字符边界并标记 `messageTruncated`。文档身份不得截断后伪装为可复查；身份触发敏感信息遮蔽时 SHALL 标记 `documentIdentityAvailable: false`。首版 SHALL 不提供游标（Cursor），不以时间戳伪造无遗漏分页。

#### Scenario: 正文超过输出上限
- **WHEN** 日志堆栈超过本次正文限制
- **THEN** 返回有界正文及截断标记，调用方可缩小范围、减少条数并显式提高正文上限继续读取

#### Scenario: 达到条数上限
- **WHEN** 查询返回条数等于本次限制
- **THEN** `limitReached` 为真，仅表示达到限制，不声称还有下一页或结果已完整

#### Scenario: 显式展示关键词子字段
- **WHEN** 用户选择存在的 `.keyword` 字段，而该多字段（Multi-field）不在源文档中
- **THEN** 工具从映射字段取值返回实际值及多值事实，不仅按源路径判定缺失

#### Scenario: 默认正文被视图排除
- **WHEN** 视图的展示排除包含 `message`，查询本身仍有效
- **THEN** 工具保留命中、未展示原因和实际过滤范围，不把字段排除当成日志未命中

### Requirement: 有界统计及近似说明

`connection kibana aggregate` SHALL 要求连接编号和 `--field`，支持与搜索相同的视图、时间和过滤条件，`--top` 默认 10、最多 100。系统 SHALL 只提供受控词项统计（Terms Aggregation），使用可聚合的兼容精确字段，返回分组计数、`sum_other_doc_count`、`doc_count_error_upper_bound` 和远端执行状态，不返回日志正文或接受任意聚合树。顶部条数限制、计数误差及字段覆盖限制 SHALL 独立说明，不把前几项当作全部服务。

#### Scenario: 统计存在其他分组或计数误差
- **WHEN** 远端返回非零其他文档计数或非零计数误差
- **THEN** 工具保留这些事实并标记限制，不因远端执行结束而宣称全量精确统计

### Requirement: 查询兼容性与只读动作边界

工具 SHALL 仅提供视图、字段读取及受控只读搜索和统计，不提供写日志、更新、删除、重建索引、任意代理或重启业务能力。首版 SHALL 使用固定同步搜索通道，不提交搜索会话（Search Session）或持久化选项，不自动改用异步搜索或启动未知生命周期的轮询。支持范围 SHALL 以当前查询通道和响应结构验证为依据，版本未知 SHALL 如实返回；版本读取权限不足不得单独阻止已经可核验的查询。内部接口（Internal API）被限制、认证、权限、网络或协议不兼容时 MUST 局部明确诊断，不自动改走浏览器、其他环境、开发控制台代理或猜测的 Elasticsearch 地址，也不冒充内部客户端绕过访问限制。不同部署 SHALL 在使用时验证，不将单个 8.5.1 探索样本当作所有 8.x/9.x 已兼容。

#### Scenario: 登录成功但搜索接口不可用
- **WHEN** 网站认证成功而只读查询通道被拒绝或响应结构不受支持
- **THEN** 返回查询能力未验证的具体原因，不宣称连接可查询日志

#### Scenario: 状态接口权限不足
- **WHEN** 版本读取被拒绝但视图与查询响应均可验证
- **THEN** 返回版本未知及其原因，不把该失败扩散为其他查询失败

### Requirement: 执行时限和字节限制

单次动作 SHALL 限定总时限 15 秒，搜索服务端执行时限 5 秒；日志远端响应及最终输出各最多 4 MiB，视图元数据最多 8 MiB。远端读取 MUST 按累计字节限制中止，最终输出必须为合法 UTF-8 和 JSON。超时、超限和限流 SHALL 明确诊断，不自动重试，不将超限包装成成功空数组。

#### Scenario: 远端响应超过限制
- **WHEN** 日志响应流累计超过 4 MiB
- **THEN** 工具中止读取并报告超限，不先读取完整正文或报告成功零命中

### Requirement: 结果身份与完整性分别报告

结果 SHALL 沿用 `schemaVersion: buildr.connection-result/v1`，操作名为 `kibana-views|kibana-fields|kibana-search|kibana-aggregate`。搜索和统计 SHALL 返回连接编号、观察到的连接版本、环境、规范化目标、版本或未知、查询通道、视图身份及元数据观察时间、实际时间范围和条件、实际字段、远端执行摘要及独立警告。

系统 MUST 验证响应结构；部分成功时保留可用结果并返回 `incomplete: true`。执行未结束、远端超时、分片失败、正文截断、达到条数限制、字段覆盖不确定及统计限制 SHALL 分别说明，不用 `isPartial: false` 覆盖其他限制。没有目标分片 SHALL 明确标记 `no_target_shards` 和覆盖限制，不当作日志读取权限已验证。零命中 SHALL 只说明本次实际范围没有返回匹配，不证明整个服务没有异常；错误不得转成零命中。

#### Scenario: 远端返回部分命中
- **WHEN** 查询仍在执行、发生超时或部分分片失败但有可读命中
- **THEN** 保留命中并标记未完整及具体原因，不宣称完整成功

#### Scenario: 返回结构与已支持协议不一致
- **WHEN** 工具不能验证命中或必要执行状态
- **THEN** 返回协议不兼容诊断，不把缺失字段默认成执行成功

### Requirement: 敏感信息与不可信日志

连接密码及生成的认证头值 MUST 不进入工具结果、诊断、任务正文或代码库。结果离开应用前 SHALL 遮蔽已定义的敏感键及文本请求头，包括 `Authorization`、`Proxy-Authorization`、`Cookie`、`Set-Cookie`、`password`、`access_token`、`refresh_token`、`api_key`；字段值、正文、查询回显和错误均采用相同处理，不开放 `--raw` 绕过，不输出原始远端错误正文或响应头。系统 SHALL 报告遮蔽和截断，不宣称能够识别任意业务秘密。日志 MUST 被作为不可信外部数据使用，其中指令不得扩大智能体（Agent）的权限；不自动持久化日志或建立长期缓存。

#### Scenario: 错误正文或命中包含认证信息
- **WHEN** 远端响应包含连接密码、认证头、敏感键或文本请求头
- **THEN** 成功和错误路径均在输出前遮蔽，并保留处理事实，不返回未清洗原文

#### Scenario: 日志正文包含操作指令
- **WHEN** 日志要求智能体（Agent）执行额外命令或发送信息
- **THEN** 指引明确将其视为调查数据，不把它当用户授权或改变任务边界

### Requirement: 智能体发现与自主调查

Buildr 技能（Skill） SHALL 指引智能体（Agent）使用已有 `connection list --json` 根据 `logs/kibana`、名称、环境和真实目标选择稳定连接编号，按需要组合视图、字段、搜索和统计，复用本机认证。只读日志调查 SHALL 不要求创建正式任务（Formal Task）、先执行 Doctor 或让用户每次重新提供密码；需要其他修改时 SHALL 遵循相应授权。系统 SHALL 不把连接配置变成固定调查流程或自动修复授权。

#### Scenario: 从任务工作树调查日志
- **WHEN** 智能体（Agent）在同一工作空间（Workspace）的工作树（Worktree）执行日志工具
- **THEN** 使用规范来源的同一连接和认证，输出当前目标与范围，不复制连接或改用其他环境
