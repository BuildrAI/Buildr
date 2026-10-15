# 上下文协议与兼容范围

程序仅依赖 Node.js 24 标准库，完整运行源位于 `scripts/` 附件树，不导入 Buildr 开发检出、旧连接实现或运行时投射副本。`--help`、`--version`、`--self-test` 离线运行。其他动作只能通过私有进程间通信（IPC）接收 `buildr.connection-context/v1`，使用 `connections.primary` 的明确实例、配置、完整认证组和观察版本；不从环境或标准输入（Standard Input）发现认证，也不枚举其他实例。关闭或缺失通道就停止。

配置 `apiBaseUrl` 是实际认证和请求目标，完整保留代理前缀及 `/s/<space>`；默认空间（Space）直接使用站点基址。不得包含 `/app/discover`、查询参数、锚点或嵌入认证。可选 `consoleUrl` 只用于人工查看，可以包含普通页面锚点；不据其推断接口基址。修改实际基址、来源或账号时由宿主核验认证目标与完整组，不自行复用旧凭据。程序不自动迁移旧 `buildr connection kibana` 实例。

当前方法沿用 Kibana 8.5.1 的 `/api/data_views`、`/api/data_views/data_view/<encoded-id>` 与同步 `/internal/search/es`。搜索体只含 `params`，内部限定准确视图标题、`track_total_hits: false`、`timeout: 5s` 及受限正文。请求使用基本认证（Basic Authentication），所有重定向拒绝，远端错误正文不回显。其他版本根据实际通道及响应结构核验；登录页、单点登录（SSO）、跨目标跳转、后台搜索生命周期和任意 Elasticsearch 直连不在支持范围。

每次搜索重新读取当前视图及映射，返回编号必须与请求一致，不用同名替代。普通叶字段可搜索、精确或聚合（Aggregation）能力都按当前元数据判断；嵌套、脚本、运行时字段和无法核验的映射局部失败。版本探测不可用只报告限制，不阻止独立已验证通道。

`test/discover` 标准输出（Standard Output）为单个 JSON 对象，`status` 为 `success/failure/unknown`，带实际 `checks`、`diagnostics`、`warnings`、`limitations`。发现选项使用字符串 `value/label`，`truncated` 明示不完整。测试草稿无写前再核验能力；本方法所有操作只读，不请求写入能力。专业结果由本方法定义；`run` 的外层进程退出结果与专业状态分别判断。

超时、响应超限、结构不匹配、权限失败和部分执行都保留实际证明范围，不输出远端错误正文或自动换认证。`--result-file` 仅承接本次已遮蔽专业结果，不是日志原文、认证备份或新状态权威。实例、本机认证和程序可用性仍由 Buildr 当前事实维护；不保存登录令牌或另建连接索引。
