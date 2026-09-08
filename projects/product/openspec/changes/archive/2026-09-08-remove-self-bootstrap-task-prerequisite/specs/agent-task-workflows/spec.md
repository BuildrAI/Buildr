## MODIFIED Requirements

### Requirement: 协作者更新必须与本地 self-bootstrap activation 排他路由
Buildr Agent workflow MUST依据当前Workspace是否安装自举Component与已交付变化范围选择自举或普通Workspace update。命中自举范围时MUST使用唯一`buildr-self-bootstrap-sync`执行器；Task编号仅为可选说明，不查询Task状态作为门禁。真实基线、delivered ref、retained checkout与Product Node/Doctor事实继续必需；MUST NOT从commit author、缺失Task或任务终态推断适用性。

#### Scenario: 普通协作者更新
- **WHEN** selected Git provider证明canonical checkout因remote提交而前进且未命中自举范围
- **THEN** Agent MUST按普通Workspace update运行适用Doctor/sync
- **AND** MUST不启动`buildr-self-bootstrap-sync`

#### Scenario: 协作者提交使 canonical tree 前进且本地没有匹配 Finish
- **WHEN** canonical tree因协作者提交前进且未命中自举范围
- **THEN** 该事实 MUST按普通Workspace update处理
- **AND** 旧Finish Result缺失 MUST不被视为异常

#### Scenario: 协作者更新只造成当前 Agent managed projection stale
- **WHEN** Doctor只报告未安装自举Component的普通Workspace当前Agent受管投影stale
- **THEN** Agent MUST按Workspace sync边界处理
- **AND** sync结果 MUST不创建Task或自举证据

#### Scenario: Doctor 报告非 workspace sync blocker
- **WHEN** Doctor报告不能由sync处理的具体问题
- **THEN** Agent MUST交给对应owner处理
- **AND** MUST不把一次sync宣称为完整修复

#### Scenario: matching自举交付
- **WHEN** 当前工作具有已核验基线、delivered ref和命中Product自举范围的真实变化，无论有无Task记录
- **THEN** Agent MUST调用唯一self-bootstrap runner
- **AND** runner失败 MUST只形成Activation Attention，不撤销交付或Task结果

#### Scenario: 当前会话存在 matching Formal Finish Result
- **WHEN** 历史调用方只提供旧Formal Finish Result而没有当前Git交付事实
- **THEN** self-bootstrap MUST不采用该历史Result
- **AND** 调用方 MUST改用真实基线、delivered ref与retained事实

#### Scenario: workspace sync 不产生 Task 或 Finish authority
- **WHEN** 普通Workspace update执行sync
- **THEN** sync MUST只收敛Workspace与Agent runtime
- **AND** MUST不创建Task、Verification、Finish或self-bootstrap结果
