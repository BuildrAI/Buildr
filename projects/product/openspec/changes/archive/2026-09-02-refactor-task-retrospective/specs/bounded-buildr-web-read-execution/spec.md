## MODIFIED Requirements

### Requirement: Buildr Web 三个 Task 专业 Tab 必须通过 executor 读取
Buildr Web MUST让Evidence中的Review/Verification与Parent Coordination通过固定容量只读executor执行。Task Record与本机复盘文档使用自身轻量安全reader，不进入专业executor。

#### Scenario: 并发读取Task证据
- **WHEN** 页面并发请求Review和Verification
- **THEN** 两个请求 MUST通过有界executor调用所属Application

#### Scenario: 调用已删除operation
- **WHEN** 调用方提交development、environment、retrospective或finish-history read operation
- **THEN** executor MUST返回forbidden且不启动worker

#### Scenario: 三个 Tab 独立并发请求
- **WHEN** 页面同时读取Evidence、Parent和其他保留Task视图
- **THEN** executor MUST有界调度Review、Verification和Coordination

#### Scenario: 写入和专业生命周期操作
- **WHEN** 页面执行Task Record mutation
- **THEN** MUST走Task Record writer而非只读executor

#### Scenario: 已解析 canonical root 的只读请求
- **WHEN** Web Host已解析canonical root
- **THEN** executor MUST只传递root、Task ID和允许的operation

### Requirement: 只读 executor 必须保持当前 Task read authority 与输入边界
Task只读executor MUST只分发Task Overview、Review、Verification和Coordination read操作，并保持有界执行、取消和资源回收。复盘文档读取归Task Record HTTP。

#### Scenario: 读取任务详情
- **WHEN** Buildr Web通过executor读取Task详情专业结果
- **THEN** executor MUST返回目标Application read model
- **AND** MUST不读取Retrospective、Environment或旧研发/收尾事实
