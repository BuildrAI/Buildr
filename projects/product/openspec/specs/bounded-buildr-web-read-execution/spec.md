# bounded-buildr-web-read-execution Specification

## Purpose

为 Buildr Web 只读 Application 提供固定容量、可取消、错误可传播的阻塞读取执行边界。

## Requirements

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
Buildr Web MUST让Evidence中的Review/Verification与Parent Coordination通过固定容量只读executor执行。Executor MUST不注册Development或旧Finish history operation；Environment与Retrospective继续使用各自既有安全reader。

#### Scenario: 并发读取Task证据
- **WHEN** 页面并发请求Review和Verification
- **THEN** 两个请求 MUST通过有界executor调用所属Application
- **AND** MUST不读取Development、Terminal Delivery或Finish history

#### Scenario: 调用已删除operation
- **WHEN** 调用方提交development或finish-history read operation
- **THEN** executor MUST返回forbidden operation
- **AND** MUST不启动worker或访问Workspace SQLite

#### Scenario: 三个 Tab 独立并发请求
- **WHEN** 页面同时读取Evidence、Parent和其他保留Task视图
- **THEN** executor MUST有界调度Review、Verification和Coordination请求
- **AND** 任一请求失败 MUST不取消或覆盖其他专业结果

#### Scenario: 写入和专业生命周期操作
- **WHEN** 页面执行Task Record mutation或其他专业写操作
- **THEN** MUST继续走对应writer接口
- **AND** MUST不通过只读executor执行写入

#### Scenario: 已解析 canonical root 的只读请求
- **WHEN** Web Host已解析并授权canonical Workspace root
- **THEN** executor MUST只传递该root、Task ID和允许的read operation
- **AND** worker MUST不重新扫描或选择其他Workspace

### Requirement: Buildr Web Runtime 只读执行公开命名必须保持边界
只读 executor、其测试和诊断 MUST 使用 Buildr Web Runtime 术语；迁移 MUST NOT 扩大 Task read authority、输入边界、取消传播或固定容量执行器。

#### Scenario: 只读 executor 命名迁移
- **WHEN** 维护者查看 bounded read executor 的公开文档或测试结果
- **THEN** 组件 MUST 被描述为 Buildr Web Runtime read executor
- **AND** 同一 Task-scoped 只读边界 MUST 继续生效

### Requirement: 只读 executor 必须保持当前 Task read authority 与输入边界
Task只读executor MUST只分发当前存在的Task Overview、Environment、Review、Verification、Coordination与Retrospective read操作，并保持有界执行、取消和资源回收。

#### Scenario: 读取任务详情
- **WHEN** Buildr Web通过executor读取Task详情
- **THEN** executor MUST返回目标Application的当前read model
- **AND** MUST不读取或恢复已退役研发与旧收尾事实
