# 命令与结果

以下调用均先读取当前实例（Connection Instance）及版本（Revision），再使用 `buildr connection-skill run --help` 展示的通用启动格式，明确提供实例编号、已观察版本、程序 `cli` 和专业参数。帮助与版本检查不接收认证。

| 专业参数 | 作用 | 完成依据 |
| --- | --- | --- |
| `--help` | 离线列出程序能力 | 程序正常退出并返回帮助 |
| `--version` | 离线核对程序协议版本 | `buildr-mysql 1.0.0` |
| `test --json` | 只读版本检查 | `status: success`、检查通过、服务器版本和耗时 |
| `databases --json` | 读取账号可见数据库 | `status: success` 及有界 `options`、`databases` |

声明的测试槽位（Hook）和数据库发现槽位（Hook）可用于保存前的候选配置，不保存配置或个人认证。数据库发现允许尚未选择默认数据库；地址、端口和完整认证组必须有效。

程序只支持以上两个专业动作，不接受任意查询语句（SQL）。表结构、查询和展示数据库选择由独立内置查询工具负责。查询工具要求每次调用提供实例已观察版本；旧版本失败后重新读取并让用户继续使用同一明确目标，不静默切换实例。

独立命令行接口（CLI）入口为 `buildr mysql-query --help`。先读取连接列表或 `get` 的当前版本，再使用 `databases`、`tables`、`columns`、`query`、`preferences` 或 `save-preferences`，每次明确 `--connection <id> --expected-revision <revision>`。查询可用 `--sql-file <file|->` 保留完整输入；保存偏好使用含其独立 `expectedRevision` 的文件。新旧实例仍分别使用明确身份，旧 `buildr connection query` 保留旧入口。

MySQL 每次调用使用独立连接、10 秒时限及只读事务（Read-only Transaction），禁用多语句（Multiple Statements）和本地文件（LOCAL FILE）能力。发现结果超过 1000 个数据库则明确失败，不能将截断列表冒充完整发现。程序错误输出使用有界诊断，不回显认证、原始驱动错误或完整远端响应。

`status: failure` 表示本次调用未完成；超时或进程终止不证明远端状态，但此程序不提交业务写入。先核对当前连接、程序、认证来源和网络，再决定是否重试。真实读取验证只能证明观察到的账号与数据范围。
