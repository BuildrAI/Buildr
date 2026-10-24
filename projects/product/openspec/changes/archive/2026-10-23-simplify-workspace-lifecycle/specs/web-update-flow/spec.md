## MODIFIED Requirements

### Requirement: 后台准备必须异步且可观察

更新任务的下载准备 MUST 异步执行，prepare 请求 MUST 在校验通过后立即返回任务快照，不得持有请求等待下载完成。任务状态 MUST 覆盖 `idle`、`preparing`、`ready`、`failed`、`applying` 与完成语义，状态读取 MUST 返回真实快照，不得伪造进度或成功。同一时刻全实例只允许一个更新任务；已有任务处于 `preparing` 或 `applying` 时新的 prepare MUST 冲突拒绝，`ready`、`failed` 或 `idle` 状态下新的 prepare MUST 可重新开始。

#### Scenario: 准备期间页面可继续使用

- **WHEN** 更新任务处于 `preparing`
- **THEN** 本机 Buildr Web 的其他页面请求与功能 MUST 照常响应
- **AND** 下载过程 MUST NOT 阻塞 HTTP 服务

#### Scenario: 下载完成后就绪待确认

- **WHEN** 后台下载成功落盘
- **THEN** 任务状态 MUST 转为 `ready` 并携带已钉住的目标版本
- **AND** SHALL 在用户已确认完整更新时自动接续安装；仅准备请求继续等待应用确认

#### Scenario: 下载失败如实报告

- **WHEN** 后台下载因网络、权限或 registry 原因失败
- **THEN** 任务状态 MUST 转为 `failed` 并携带错误代码与原因
- **AND** MUST 允许用户重新发起 prepare

#### Scenario: 任务进行中拒绝重复准备

- **WHEN** 已有任务处于 `preparing` 或 `applying` 状态时收到新的 prepare 请求
- **THEN** MUST 返回任务忙冲突且不改变现有任务

## ADDED Requirements

### Requirement: 完整更新自动准备全部登记空间并支持局部恢复
用户确认完整更新后 SHALL 自动完成下载、精确安装、已有启动器维护、网页交接及本安装来源全部已登记空间的资源采用、入口生成和诊断。记录 MUST 跨进程保存目录身份与逐项结果。部分失败 MUST 保留成功结果并允许单项或全部失败重试；重试 MUST NOT 重复安装软件。开发模拟及预览隔离继续生效。

#### Scenario: 所有空间可访问
- **WHEN** 用户确认更新且安装、交接及所有空间准备成功
- **THEN** MUST 显示全部空间可使用新版

#### Scenario: 部分目录失败
- **WHEN** 一个目录不可访问或存在内容冲突
- **THEN** MUST 继续其他目录，显示软件已更新及待完成目录；重试 MUST 重新核对现场并仅接续未完成项

#### Scenario: 新实例恢复
- **WHEN** 新版进程读取未完成记录且可信运行版本匹配
- **THEN** MUST 接续工作空间准备，不能将恢复连接等同于全部完成
