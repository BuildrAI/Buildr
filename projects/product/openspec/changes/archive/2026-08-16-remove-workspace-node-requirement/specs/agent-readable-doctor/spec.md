## REMOVED Requirements

### Requirement: doctor 必须只读诊断 Workspace Node toolchain
**Reason**: 普通Workspace不再声明或拥有Node runtime，缺少Node不得产生Doctor finding。
**Migration**: Doctor只继续检查Buildr当前npm/development installation identity；旧Workspace Node声明与本机runtime均忽略。

#### Scenario: runtime 缺失
- **WHEN** 旧Workspace曾声明的本机Node runtime不存在
- **THEN** Doctor MUST NOT产生Workspace Node finding或repair action
