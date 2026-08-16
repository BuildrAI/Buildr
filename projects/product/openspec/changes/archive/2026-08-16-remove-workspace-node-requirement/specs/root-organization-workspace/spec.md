## REMOVED Requirements

### Requirement: Workspace 生命周期必须管理 Node toolchain 声明
**Reason**: Node toolchain不属于Organization Workspace的通用Domain。
**Migration**: `init`不再写入，`sync`读取旧字段后在canonical重写中移除且不准备runtime。

#### Scenario: 同步已有 canonical Workspace
- **WHEN** Workspace含有legacy `runtime.node`并执行sync
- **THEN** canonical metadata MUST移除该声明且MUST NOT下载或删除Node runtime
