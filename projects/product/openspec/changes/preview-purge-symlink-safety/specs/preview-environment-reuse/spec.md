## MODIFIED Requirements

### Requirement: 停止与彻底清理

`preview stop` MUST 默认只停止实例并保留数据。`preview stop --purge` MUST 在停止确认和 owner 身份匹配后删除该实例根，包括会话、附件、交接材料、沿用的账号与配置副本、程序副本、日志、登记与端口记录。实例根内的符号链接（包括指向实例外宿主缓存的声明链接与断链）MUST 按链接条目删除，MUST NOT 跟随链接或删除、修改链接目标。owner 不匹配、实例停止未确认、目标路径不在预览根内或目标不是真实目录时，清理 MUST 拒绝并保留现场。

#### Scenario: 清理沿用过的预览
- **WHEN** 预览 owner 请求 `preview stop --purge` 且实例已确认停止
- **THEN** 该实例根 MUST 被删除
- **AND** 预览会话、凭证副本、程序副本与日志 MUST 不再存在

#### Scenario: 错误 owner 清理被拒绝
- **WHEN** 非 owner 调用方请求清理另一预览实例
- **THEN** 清理 MUST 拒绝并保持实例目录不变

#### Scenario: 停止未确认不清理
- **WHEN** 实例停止无法确认或目标路径越界
- **THEN** 清理 MUST 保留现场并报告具体原因

#### Scenario: 含宿主缓存链接的实例可清理
- **WHEN** 实例根内存在指向实例外目录的符号链接（如 agent-service 的宿主缓存声明链接），owner 请求 `preview stop --purge` 且实例已确认停止
- **THEN** 该实例根 MUST 被删除且链接条目不再存在
- **AND** 链接目标目录及其内容 MUST 保持原样

#### Scenario: 断链随实例根删除
- **WHEN** 实例根内存在目标不存在的断链，owner 请求 `preview stop --purge` 且实例已确认停止
- **THEN** 清理 MUST 成功并将断链随实例根删除
- **AND** MUST NOT 因断链拒绝清理