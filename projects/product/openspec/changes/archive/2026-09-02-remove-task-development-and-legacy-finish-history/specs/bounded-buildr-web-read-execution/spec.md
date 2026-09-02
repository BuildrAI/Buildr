## MODIFIED Requirements

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
