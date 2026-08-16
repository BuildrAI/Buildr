## REMOVED Requirements

### Requirement: Workspace 必须持有精确 Node version
**Reason**: Node.js 不是 Organization Workspace 的通用能力，缺少 Node 不应使 Workspace invalid 或 migration-required。
**Migration**: canonical reader忽略旧`runtime.node`，sync重写时移除该字段；Buildr checkout的精确开发版本迁入Product-owned source。

#### Scenario: 解析 canonical Node 声明
- **WHEN** Buildr读取含legacy `runtime.node`的Workspace metadata
- **THEN** reader MUST忽略该字段且canonical writer MUST不再输出它

### Requirement: Workspace Node runtime 必须可确定性准备和恢复
**Reason**: `init`与`sync`不应下载或恢复用户Workspace不一定需要的Node distribution。
**Migration**: 停止准备runtime并保留磁盘中的既有文件，不执行自动删除。

#### Scenario: 删除后恢复
- **WHEN** legacy Workspace Node runtime缺失并执行sync
- **THEN** sync MUST NOT下载、恢复或登记Node runtime

### Requirement: Workspace Node 升级必须显式发生
**Reason**: Workspace不再拥有Node version，因此不存在Workspace Node升级生命周期。
**Migration**: 需要Node的具体命令由其Project/Service声明和执行环境负责。

#### Scenario: sync 面对可用的新版本
- **WHEN** 上游存在新的Node版本并执行Workspace sync
- **THEN** sync MUST NOT查询、选择或写入Node版本

### Requirement: Workspace Node 执行证据必须声明 runtime role
**Reason**: Verification、Environment与Finish不再拥有全局Workspace Node execution context。
**Migration**: 新evidence删除该字段，旧字段只读忽略。

#### Scenario: 验证和 Finish 执行
- **WHEN** Verification或Finish执行声明命令
- **THEN** evidence MUST NOT包含Workspace Node role、identity或executable字段

### Requirement: Host Node 与 Workspace Node 必须分离生命周期
**Reason**: Workspace Node生命周期被完整删除；只保留npm Host Node和Buildr checkout开发Node各自的产品边界。
**Migration**: npm installation继续使用`engines.node`，Buildr checkout使用Product-owned精确版本。

#### Scenario: npm Buildr 进入 Workspace
- **WHEN** npm Buildr进入没有Node声明的Workspace
- **THEN** 主进程 MUST继续使用formal Host Node且MUST NOT创建Workspace Node生命周期
