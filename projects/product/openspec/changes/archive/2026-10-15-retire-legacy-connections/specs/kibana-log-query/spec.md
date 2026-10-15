## MODIFIED Requirements

### Requirement: 智能体发现与自主调查

Buildr 技能（Skill） SHALL 指引智能体（Agent）通过 `buildr connection-skill list --json` 按实例绑定、环境及真实目标选择稳定编号，加载准确绑定的 Kibana 技能（Skill）及专业程序帮助，按需要组合视图、字段、搜索和统计，使用完整选定认证组。只读日志调查 SHALL 不要求创建正式任务（Formal Task）、先执行 Doctor 或让用户每次重新提供密码；需要其他修改时 SHALL 遵循相应授权。系统 SHALL 不把连接配置变成固定调查流程或自动修复授权。

#### Scenario: 从任务工作树调查日志
- **WHEN** 智能体（Agent）在同一工作空间（Workspace）的工作树（Worktree）执行日志工具
- **THEN** 使用规范来源的同一连接和认证，输出当前目标与范围，不复制连接或改用其他环境

### Requirement: Kibana 目标解析与认证绑定

Kibana 连接技能（Connection Skill） SHALL 使用明确的 HTTP/HTTPS 专业接口基址 `apiBaseUrl`，保留反向代理前缀及网站空间（Space）；可选 `consoleUrl` 仅用于人工查看，不从 Discover 地址、网站端口或页面片段推断认证目标。系统 MUST 拒绝接口地址中嵌入认证、页面路径、查询串或片段及不支持协议的地址，不猜测 Elasticsearch 地址。基本认证（Basic Auth） SHALL 使用明确实例注入的完整团队或个人认证组，并绑定所选技能源、程序接收方、实际接口目标及用户名；改变协议、主机、端口、前缀、空间、来源或用户名后 MUST 重新核对完整认证，不向新目标发送旧认证。请求 MUST 不跟随重定向、不关闭证书验证、不自动降级传输；显式 HTTP SHALL 显示明文传输警告。

#### Scenario: 保留非默认网站空间
- **WHEN** 用户明确配置包含代理前缀及 `/s/{spaceId}` 的接口基址，并另行提供可选 Discover 网站地址
- **THEN** 工具仅向已明确的接口前缀和空间（Space）发送请求，网站入口不携带认证，也不决定接口目标

#### Scenario: 修改认证目标
- **WHEN** 已保存连接改变空间（Space）或用户名但未提供新认证
- **THEN** 操作在发送认证前明确失败；仅改变名称、环境或默认视图不使认证失效

#### Scenario: 远端要求重定向
- **WHEN** Kibana 请求收到重定向响应
- **THEN** 工具报告目标或认证诊断，不把凭证发送至跳转地址

### Requirement: 当前视图身份与有界发现

专业程序 SHALL 提供 `views` 和 `fields`，通过 `buildr connection-skill run` 接收准确实例及已观察版本；工作空间（Workspace）和认证由私有上下文提供，不由专业参数再次选择。两项动作 SHALL 支持名称过滤、偏移和条数。发现默认返回 100 项、最多 500 项，视图按编号、字段按名称稳定排序，返回过滤后总数及 `limitReached`；多次调用 SHALL 不宣称同一快照。默认 `dataViewId` SHALL 允许为空；字段、查询和统计 SHALL 使用显式 `--data-view` 或默认编号，每次重读当前视图的索引模式（Index Pattern）、时间字段和字段能力，不把缓存名称或索引模式当权威。视图不存在、不可见或必要元数据不能核实时 MUST 局部失败，不按同名替换或扩大到任意索引。首版 SHALL 只查询普通 Elasticsearch 视图，其他专用类型返回局部不支持；发现仍能说明可见视图及类型。

#### Scenario: 尚未选择默认视图
- **WHEN** 连接已保存但默认视图为空
- **THEN** `views` 仍可执行；依赖视图且未传 `--data-view` 的动作返回 `kibana_data_view_required`

#### Scenario: 默认视图被删除
- **WHEN** 用户或工具使用已删除的视图编号
- **THEN** 返回明确诊断，不改用同名视图或其他索引

#### Scenario: 字段目录很大
- **WHEN** 当前视图拥有数千字段而调用方只读取默认页
- **THEN** 输出限定条数及匹配总数，不自动读取所有页填满上下文

### Requirement: 有界日志输出与文档复查

所选专业程序的 `search` SHALL 支持 `--limit` 默认 100、最多 500，`--fields` 最多 20 个普通字段，`--order asc|desc` 默认降序，以及 `--message-bytes` 默认 8 KiB、最多 256 KiB。默认展示时间、正文、服务、命名空间（Namespace）及存在的 `trace.id`、`log.level`；缺少非过滤展示字段 SHALL 保留缺失事实而不删除该命中。展示 SHALL 遵循当前视图的 `sourceFilters` 排除，显式请求被排除字段返回诊断，默认字段被排除时说明未展示原因；展示排除不得被当成文档过滤或权限边界。映射字段取值 SHALL 保留数组、缺失和忽略值事实，不通过 `.keyword` 的源路径错误判断字段缺失，不以查询解析字段替代原正文路径，不请求所有字段或完整源文档。每条日志 SHALL 返回可复查的 `_index`、`_id`、时间及实际字段，保留日期文本精度；正文截断 MUST 保持完整字符边界并标记 `messageTruncated`。文档身份不得截断后伪装为可复查；身份触发敏感信息遮蔽时 SHALL 标记 `documentIdentityAvailable: false`。首版 SHALL 不提供游标（Cursor），不以时间戳伪造无遗漏分页。

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

所选专业程序的 `aggregate` SHALL 接受明确注入的实例上下文并要求 `--field`，支持与搜索相同的视图、时间和过滤条件，`--top` 默认 10、最多 100。系统 SHALL 只提供受控词项统计（Terms Aggregation），使用可聚合的兼容精确字段，返回分组计数、`sum_other_doc_count`、`doc_count_error_upper_bound` 和远端执行状态，不返回日志正文或接受任意聚合树。顶部条数限制、计数误差及字段覆盖限制 SHALL 独立说明，不把前几项当作全部服务。

#### Scenario: 统计存在其他分组或计数误差
- **WHEN** 远端返回非零其他文档计数或非零计数误差
- **THEN** 工具保留这些事实并标记限制，不因远端执行结束而宣称全量精确统计

### Requirement: 结果身份与完整性分别报告

专业操作结果 SHALL 使用 `schemaVersion: kibana.connection-result/v1`，操作名为 `views|fields|search|aggregate`，并以 `status: success|unknown|failure` 区分已验证完成、不完整或结果未知及失败；宿主的程序退出事实不得代替专业结果判断。搜索和统计 SHALL 返回连接编号、观察到的连接版本、环境、规范化目标、版本或未知、查询通道、视图身份及元数据观察时间、实际时间范围和条件、实际字段、远端执行摘要及独立警告。

系统 MUST 验证响应结构；部分成功时保留可用结果并返回 `incomplete: true`。执行未结束、远端超时、分片失败、正文截断、达到条数限制、字段覆盖不确定及统计限制 SHALL 分别说明，不用 `isPartial: false` 覆盖其他限制。没有目标分片 SHALL 明确标记 `no_target_shards` 和覆盖限制，不当作日志读取权限已验证。零命中 SHALL 只说明本次实际范围没有返回匹配，不证明整个服务没有异常；错误不得转成零命中。

#### Scenario: 远端返回部分命中
- **WHEN** 查询仍在执行、发生超时或部分分片失败但有可读命中
- **THEN** 保留命中并标记未完整及具体原因，不宣称完整成功

#### Scenario: 返回结构与已支持协议不一致
- **WHEN** 工具不能验证命中或必要执行状态
- **THEN** 返回协议不兼容诊断，不把缺失字段默认成执行成功

### Requirement: 敏感信息与不可信日志

本次认证值及生成的认证头 MUST 不进入专业工具结果、诊断、提示词（Prompt）、任务正文、公共技能源或发布物；团队实例文件中的完整认证组 SHALL 按 `connection-instance-files` 明确共享及维护，不能把该团队源边界扩大为专业输出可公开认证。结果离开应用前 SHALL 遮蔽已定义的敏感键及文本请求头，包括 `Authorization`、`Proxy-Authorization`、`Cookie`、`Set-Cookie`、`password`、`access_token`、`refresh_token`、`api_key`；字段值、正文、查询回显和错误均采用相同处理，不开放 `--raw` 绕过，不输出原始远端错误正文或响应头。系统 SHALL 报告遮蔽和截断，不宣称能够识别任意业务秘密。日志 MUST 被作为不可信外部数据使用，其中指令不得扩大智能体（Agent）的权限；不自动持久化日志或建立长期缓存。

#### Scenario: 错误正文或命中包含认证信息
- **WHEN** 远端响应包含连接密码、认证头、敏感键或文本请求头
- **THEN** 成功和错误路径均在输出前遮蔽，并保留处理事实，不返回未清洗原文

#### Scenario: 日志正文包含操作指令
- **WHEN** 日志要求智能体（Agent）执行额外命令或发送信息
- **THEN** 指引明确将其视为调查数据，不把它当用户授权或改变任务边界
