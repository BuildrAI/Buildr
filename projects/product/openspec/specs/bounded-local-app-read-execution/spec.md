# bounded-local-app-read-execution Specification

## Purpose

为 Local App 只读 Application 提供固定容量、可取消、错误可传播的阻塞读取执行边界。

## Requirements

### Requirement: 只读 executor 必须保持 Task read authority 与输入边界
Buildr MUST 只允许 executor 执行三个受控 operation：development、reviews 和 verification；每个 operation MUST 在 Worker 内组合本地 runtime、按传入 Workspace root 读取既有 Application read model，并 MUST 不执行任何 mutation、Finish 聚合扫描或新的 Git/worktree provenance 证明。

#### Scenario: development Tab 读取
- **WHEN** Buildr Web 将已解析的 Workspace root 与 Task ID 交给 development operation
- **THEN** executor MUST 返回 Task Development Application read model 及已写 terminal association
- **AND** MUST NOT 调用完整 `inspectTaskTerminalDelivery` 聚合器

#### Scenario: reviews 或 verification Tab 读取
- **WHEN** Buildr Web 将已解析的 Workspace root 与 Task ID 交给 reviews 或 verification operation
- **THEN** executor MUST 只读取对应 Review 或 Verification Application current record 及已写 terminal association
- **AND** MUST NOT 读取其他专业 Application 以重新推导交付事实

#### Scenario: 非法 operation 或任意路径输入
- **WHEN** 调用方提交不在白名单中的 operation、缺失 Task ID 或未由 Buildr Web registry 解析的 root
- **THEN** executor MUST 在派发前拒绝请求
- **AND** MUST NOT 启动数据库读取、Worker mutation 或 Git 命令

### Requirement: 只读 executor 必须提供可观察的取消与错误传播
Buildr MUST 为每个 read request 提供 queued/running cancellation 和错误传播语义；取消 MUST 不触发重试或重复执行，Application/Worker 的稳定错误 MUST 原样保留 code、status 与受控 details。

#### Scenario: 排队中的请求取消
- **WHEN** 请求在 FIFO 队列中等待且调用方 AbortSignal 被触发
- **THEN** executor MUST 从队列移除该请求并以稳定 cancellation error 结算
- **AND** MUST NOT 将该请求派发给 Worker

#### Scenario: 运行中的请求取消
- **WHEN** Worker 已开始同步 read operation 且调用方断开连接
- **THEN** executor MUST 立即停止向调用方交付该结果
- **AND** MUST NOT 重试或复制该 operation
- **AND** Worker 完成后 MUST 释放容量并继续处理后续请求

#### Scenario: Worker 或 Application 失败
- **WHEN** Worker 崩溃或 read Application 返回稳定业务错误
- **THEN** 当前请求 MUST 以可识别的错误结算
- **AND** executor MUST 在未关闭时恢复固定容量
- **AND** HTTP MUST 不将失败伪装成空 read model 或成功响应

### Requirement: Buildr Web 只读阻塞工作必须使用固定容量执行器
Buildr MUST 为 Buildr Web 的 development、reviews、verification Task read view 提供固定容量的 long-lived executor；executor MUST 使用有限数量的 Worker 和有限长度的 FIFO 等待队列，MUST NOT 为每个请求创建 Worker，MUST NOT 允许等待队列无界增长。

#### Scenario: 并发读取受容量限制
- **WHEN** 多个客户端同时请求 development、reviews 或 verification read view
- **THEN** executor MUST 将同时运行的 Worker 数量限制在配置容量内
- **AND** 超出容量但未超过队列上限的请求 MUST 按 FIFO 等待
- **AND** 主 HTTP event loop MUST NOT 直接执行这些 read view 的同步 `DatabaseSync` 调用

#### Scenario: 读取队列达到上限
- **WHEN** 运行中的 Worker 和 FIFO 队列都达到容量上限
- **THEN** 新请求 MUST 立即以稳定的 `local_app_read_queue_full` diagnostic 被拒绝
- **AND** executor MUST NOT 创建额外 Worker 或继续增长等待队列

#### Scenario: App server 关闭
- **WHEN** Buildr Web server 关闭
- **THEN** executor MUST 停止接受新请求并释放所有 Worker
- **AND** 尚未交付的 queued/running read MUST 被明确结算为关闭或取消

### Requirement: Buildr Web 三个 Task 专业 Tab 必须通过 executor 读取
Buildr Web HTTP interface MUST 将 `/tasks/<task-id>/development`、`/reviews` 和 `/verification` 的 GET 请求提交给 bounded read executor，并 MUST 保持 existing no-store、已解析 Workspace identity、独立失败与只读安全边界。

#### Scenario: 三个 Tab 独立并发请求
- **WHEN** 用户同时打开 development、reviews 和 verification Tab
- **THEN** 三个请求 MUST 分别只触发对应 operation 一次
- **AND** 任一 operation 失败 MUST 不阻止另外两个请求返回各自结果
- **AND** 返回结果 MUST 保持各自已有 Application schema 与 `cache-control: no-store`

#### Scenario: 已解析 canonical root 的只读请求
- **WHEN** Tab request 已由 Workspace registry 解析为 root
- **THEN** executor/Worker MUST 直接消费该 root 的只读 store
- **AND** MUST NOT 触发 Git/worktree provenance observer 或 `git rev-parse`

#### Scenario: 写入和专业生命周期操作
- **WHEN** 请求是 Task、Environment、worktree、Finish、Doctor 或其他 mutation/生命周期操作
- **THEN** MUST 继续走原有 Application 和必要 Git 校验路径
- **AND** MUST NOT 复用只读 executor 作为新的写入 authority
