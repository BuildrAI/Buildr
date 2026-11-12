## ADDED Requirements

### Requirement: 激活必须在旧 owner 存活时经保留交接完成

激活（activate）在准备目标运行单元被短暂 storage 锁阻塞且存在存活旧 owner 时，SHALL 在有界预算内重试准备，连接存活旧 owner 并请求运行单元采用（runtime adoption），由旧 owner 启动后继并保留旧代际至 drain；MUST NOT 以停止旧 owner 或中断活跃执行作为并行兼容目标的前置条件。激活成功 MUST 后继成为 owner 且接受新工作为依据。

#### Scenario: 忙 owner 保留交接

- **WHEN** 旧 owner 持有活跃执行且目标运行单元并行兼容
- **THEN** 激活经交接就绪，旧代际保留（retiring/retained），对话与待发送输入不丢失

#### Scenario: 短暂锁阻塞有界重试

- **WHEN** 准备因维护工作者短暂持有 storage 锁返回 owned
- **THEN** 空闲 owner 可按既有生命周期所有权 drain；忙或不可观察的 owner MUST 被保留，激活在有界预算内重试准备并经保留交接完成，MUST NOT 停止或中断旧 owner

#### Scenario: 不兼容目标保留旧执行

- **WHEN** 目标运行单元与旧 owner 不满足并行兼容
- **THEN** 服务端不触发并行交接，激活在有界等待后如实报告失败，旧 owner 与活跃执行保留，可重试

#### Scenario: 无存活 owner 冷启动不变

- **WHEN** 不存在存活 owner（冷启动或陈旧锁已清理）
- **THEN** 激活沿用既有准备与启动路径，行为不变

### Requirement: 激活失败必须保留现场并可重试

激活的等待 MUST 有界；失败 MUST 保留旧 owner、对话与待发送内容，并返回准确阶段与原因；MUST NOT 重放已生效操作或把未确认结果宣称为成功。

#### Scenario: 交接等待超时

- **WHEN** 后继在约定预算内未成为 owner
- **THEN** 激活返回可重试失败，旧 owner 继续服务，记录保留
