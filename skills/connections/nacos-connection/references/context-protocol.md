# 本机执行上下文

程序用产品 Node.js 基线独立运行，所有运行依赖都是 Node.js 标准库。实际操作采用 `fork` 的进程间通信（IPC），专业标准输入（stdin）仍可读取候选或授权。帮助与版本不接收认证。

专业程序版本 `2.0.0` 对应连接配置版本 2；私有上下文协议继续是 `buildr.connection-context/v1`。配置以 `apiBaseUrl` 作为准确接口和认证目标，`consoleUrl` 可省略且仅用于网站。宿主必须按版本绑定核对，不能将旧配置版本 1 的网站及认证隐式转换。

宿主发送 `{type: "buildr.connection-context", context}`，其中 `protocolVersion` 为 `buildr.connection-context/v1`，含 `callId`、`workspace: {id, root}`、`definition`、`connections`、`privateStateRoot`。`connections.primary` 含 `id`、安全合成的 `revision`、`config`、`authentication: {source, values}`、`authenticationRevision`；`source` 为 `team` 或 `personal`，`values` 为完整 `username` / `password` 组。可附 `revisions: {teamRevision, localRevision, definitionRevision}`。第二实例以调用方明确选择的名称注入，不提供认证枚举。

发布前程序发送 `{type: "buildr.connection-revalidate", requestId, callId}`；宿主重读本次上下文对应的实例、声明、接收程序及认证版本，返回 `{type: "buildr.connection-revalidated", requestId, ok: true}` 或 `ok: false, error: {code, message}`。变化、断连或检查超时均不发起相关发布；不替换上下文继续写入。宿主不解释 Nacos 专业授权。

`privateStateRoot` 由宿主提供受限、按提供者（Provider）隔离的本机目录。程序在其下维护 `artifacts/` 与 `publication-authorizations/`，不在团队文件中保存运行令牌或授权使用事实。授权记录只保存时间与不含正文的使用身份；原文产物（Artifact）保持完整内容和独立摘要。

普通结果为单行 JSON，`schemaVersion: nacos.connection-result/v1`，错误含 `ok: false` 和 `error: {code, message, status}`，退出码非零。普通结果带 `displayOnly: true`，隐藏已知密码、访问令牌（Access Token）和常见认证头；它是展示边界，不能以其标识、授权范围或路径接续执行。通用槽位（Hook）仍按已有协议消费固定的 `schemaVersion/operation/status` 控制值；这些固定协议值不作秘密子串替换。发现选项编号若与已知秘密重合，则局部返回 `nacos_discovery_identifier_hidden`，不提供被改写的编号或列表；准确读取事实仍可保存在私有结果。不新增通用私有结果通道。

专业命令可传 `--result-file <new-file>`：调用方明确选择路径，程序在接收上下文及网络操作前以 0600 权限独占创建，成功或错误结果未经展示改写原样保存。原文路径及完整授权范围从该私有 JSON 读取；普通输出仅以 `privateResultWritten` 表示保存事实，不要求复制展示路径。写入后本机保存失败以 `privateResultError` 表达，保留既有 `published/verified` 或未知事实，不自动重发。完整结果可能含业务秘密；它不是普通输出或公共资产。私有通道不是公开工具结果，也不是安全沙箱（Sandbox）。
