## ADDED Requirements

### Requirement: 插件准备必须使用最低 Node 版本要求
插件（Plugin）构建、完整验证与发布 SDK 准备 MUST 接受稳定版 Node `>=24.15.0`，不得因高于基准版本或主版本更高而拒绝。准备 MUST 保留实际可执行文件、实际版本及声明要求的证据，并继续核对同一次执行的 Node 身份、固定 SDK 源码、补丁与包管理器（Package Manager）。

#### Scenario: 使用较新 Node 准备插件
- **WHEN** 传入 Node 的稳定版本高于 `24.15.0` 且实际进程与可执行文件身份相符
- **THEN** 准备 MUST 接受该 Node，并记录实际版本
- **AND** MUST NOT把声明范围写成实际执行版本

#### Scenario: Node 低于最低要求
- **WHEN** 传入 Node 低于 `24.15.0`、为预发布版本或无法识别
- **THEN** 准备 MUST 在启动构建前给出最低版本诊断并停止
