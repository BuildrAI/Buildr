# 本机执行上下文

程序用产品 Node.js 基线独立运行，所有运行依赖都是 Node.js 标准库。实际操作采用 `fork` 的进程间通信（IPC），专业标准输入（stdin）仍可读取候选或授权。帮助与版本不接收认证。

宿主发送 `{type: "buildr.connection-context", context}`，其中 `protocolVersion` 为 `buildr.connection-context/v1`，含 `callId`、`workspace: {id, root}`、`definition`、`connections`、`privateStateRoot`。`connections.primary` 含 `id`、安全合成的 `revision`、`config`、`authentication: {source, values}`、`authenticationRevision`；`source` 为 `team` 或 `personal`，`values` 为完整 `username` / `password` 组。可附 `revisions: {teamRevision, localRevision, definitionRevision}`。第二实例以调用方明确选择的名称注入，不提供认证枚举。

发布前程序发送 `{type: "buildr.connection-revalidate", requestId, callId}`；宿主重读本次上下文对应的实例、声明、接收程序及认证版本，返回 `{type: "buildr.connection-revalidated", requestId, ok: true}` 或 `ok: false, error: {code, message}`。变化、断连或检查超时均不发起相关发布；不替换上下文继续写入。宿主不解释 Nacos 专业授权。

`privateStateRoot` 由宿主提供受限、按提供者（Provider）隔离的本机目录。程序在其下维护 `artifacts/` 与 `publication-authorizations/`，不在团队文件中保存运行令牌或授权使用事实。授权记录只保存时间与不含正文的使用身份；原文产物（Artifact）保持完整内容和独立摘要。

普通结果为单行 JSON，`schemaVersion: nacos.connection-result/v1`，错误含 `ok: false` 和 `error: {code, message, status}`，退出码非零。普通结果不输出密码、访问令牌（Access Token）或认证头；私有通道不是公开工具结果，也不是安全沙箱（Sandbox）。
