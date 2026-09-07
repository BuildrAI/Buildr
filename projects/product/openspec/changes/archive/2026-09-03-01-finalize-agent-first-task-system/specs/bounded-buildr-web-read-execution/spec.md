## MODIFIED Requirements

### Requirement: Buildr Web 三个 Task 专业 Tab 必须通过 executor 读取
Buildr Web Runtime的固定容量只读executor MUST只分发Review、Verification与父任务协调（Task Parent Coordination）三种专业读取。Task Record列表、详情与复盘文档由Task Record HTTP直接读取。Executor MUST不注册Task Overview、Development、Environment、Retrospective或旧Finish operation。

#### Scenario: 并发读取Task证据
- **WHEN** 页面并发请求Review和Verification
- **THEN** 两个请求 MUST通过有界executor调用所属Application
- **AND** 任一失败 MUST不取消或覆盖另一专业结果

#### Scenario: 读取父任务协调
- **WHEN** 页面请求父任务协调
- **THEN** executor MUST只调用Parent Coordination Application
- **AND** MUST不读取Review、Verification或Task Overview

#### Scenario: 调用已删除operation
- **WHEN** 调用方提交overview、development、environment或finish-history read operation
- **THEN** executor MUST返回forbidden operation
- **AND** MUST不启动worker或访问Workspace SQLite

#### Scenario: 三个 Tab 独立并发请求
- **WHEN** 页面同时读取Review、Verification和父任务协调
- **THEN** executor MUST有界调度三个独立请求
- **AND** 任一失败 MUST不覆盖其他结果

#### Scenario: 写入和专业生命周期操作
- **WHEN** 页面执行Task Record mutation
- **THEN** MUST走对应writer HTTP接口
- **AND** MUST不通过只读executor执行

#### Scenario: 已解析 canonical root 的只读请求
- **WHEN** Web Host已解析canonical Workspace root
- **THEN** executor MUST只传递该root、Task ID与允许operation
- **AND** worker MUST不扫描或选择其他Workspace

### Requirement: 只读 executor 必须保持当前 Task read authority 与输入边界
Task只读executor MUST只接受`reviews|verification|coordination`、canonical Workspace root与Task ID，并保持有界执行、取消和资源回收。复盘文档读取归Task Record HTTP。

#### Scenario: 读取专业结果
- **WHEN** Buildr Web通过executor读取保留的专业结果
- **THEN** executor MUST返回目标Application read model
- **AND** MUST不读取Overview、Retrospective、Environment或旧研发/收尾事实

#### Scenario: 读取任务详情
- **WHEN** Buildr Web读取Task详情及其专业结果
- **THEN** Task detail MUST由Task Record HTTP读取，专业结果 MUST由executor分别读取
- **AND** MUST不建立聚合Task Overview请求
