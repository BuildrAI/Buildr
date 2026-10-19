## ADDED Requirements

### Requirement: 普通初始化默认登记本机工作空间
普通 `buildr init` MUST 在工作空间（Workspace）源资产准备完成后，将目标目录登记到当前产品对应的本机 Buildr Web 工作空间（Workspace）列表，再继续既有运行时（Runtime）同步和最终诊断。该登记 MUST 复用已有本机登记及管理归属约束；源资产初始化、本机登记和运行时（Runtime）准备 MUST 按实际结果分别说明，MUST NOT 将其中一个阶段成功表述为整体初始化成功。

#### Scenario: 普通初始化自动进入当前本机列表
- **WHEN** 用户执行未指定 `--source-only` 的 `buildr init`，且目标目录的源资产准备成功
- **THEN** Buildr MUST 在继续运行时（Runtime）同步前，将目标目录加入当前产品对应的本机工作空间（Workspace）列表
- **AND** 用户随后打开同一产品的 Buildr Web 时 MUST 能从列表发现该目录，无需再次手动添加
- **AND** 登记本身 MUST NOT 启动网页服务、打开浏览器或要求网页服务已经运行

#### Scenario: 纯源资产模式不登记本机列表
- **WHEN** 用户显式执行 `buildr init --source-only`
- **THEN** Buildr MUST 保留只初始化源资产的行为，MUST NOT 新增或改变本机工作空间（Workspace）登记
- **AND** Buildr MUST NOT 为本次初始化新建网页管理归属记录或自动准备运行时（Runtime）文件

#### Scenario: 非法参数不产生登记副作用
- **WHEN** `buildr init` 收到非法智能体（Agent）标识、未知显式适配器（Adapter）或互斥选择参数
- **THEN** Buildr MUST 在写入源资产、运行时（Runtime）、本机登记或网页管理归属记录前拒绝请求
- **AND** Buildr MUST 保留已有本机登记与管理归属记录

#### Scenario: 已有目录重复初始化保持幂等
- **WHEN** 普通 `buildr init` 的目标目录已经登记在当前产品的本机列表中
- **THEN** Buildr MUST 保留原工作空间（Workspace）身份和已有登记，MUST NOT 新增重复条目或重复改写登记
- **AND** Buildr MUST 继续执行适用的运行时（Runtime）同步和最终诊断

#### Scenario: 登记保护继续适用
- **WHEN** 默认登记遇到重复身份、另一产品渠道的管理归属、不可核实的登记状态或并发版本冲突
- **THEN** Buildr MUST 按已有登记约束明确拒绝相关写入，MUST NOT 覆盖、转移归属、删除已有条目或改用另一渠道绕过保护
- **AND** Buildr MUST 保留已经成立的源资产，报告本机登记未完成及具体原因，MUST NOT 报告整体初始化成功

#### Scenario: 后续运行时准备失败不撤销已成立的登记
- **WHEN** 源资产和本机登记已经完成，但后续运行时（Runtime）同步或最终诊断失败
- **THEN** Buildr MUST 保留源资产及已成立的本机登记，并明确报告运行时（Runtime）准备未完成
- **AND** Buildr MUST 给出针对当前失败阶段的接续指引，MUST NOT 要求重新初始化或重复手动添加目录
- **AND** Buildr MUST NOT 报告整体初始化成功
