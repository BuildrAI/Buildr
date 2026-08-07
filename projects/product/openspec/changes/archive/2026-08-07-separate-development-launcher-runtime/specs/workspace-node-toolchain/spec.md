## MODIFIED Requirements

### Requirement: Workspace Node runtime 必须可确定性准备和恢复
Buildr MUST 在本机 Buildr user state 中按声明版本与 platform/arch 准备可重建 Node runtime，并 MUST 校验发行包完整性后原子发布。runtime 删除后，`sync` MUST 按同一声明版本恢复且 MUST NOT 修改声明。Development launcher MAY reference this managed runtime by identity but MUST NOT copy it into the development bundle。

#### Scenario: 首次准备 runtime
- **WHEN** `init` 已确定 Workspace Node version 且本机没有对应 runtime
- **THEN** Buildr MUST 获取、校验并原子安装完全相同版本的 Node runtime
- **AND** MUST 验证 `node`、`npm` 和版本 probe 均来自该 runtime

#### Scenario: Development launcher 引用 runtime
- **WHEN** development launcher 从已准备的 Workspace Node runtime 启动 checkout CLI
- **THEN** launcher MUST 使用 identity 指定 executable
- **AND** development bundle MUST NOT 复制 Node executable 或平台动态库

#### Scenario: 删除后恢复
- **WHEN** Workspace 声明仍为版本 V 但受管 runtime V 被删除
- **THEN** `doctor` MUST 只读报告缺失并建议 `sync`
- **AND** `sync` MUST 补回版本 V，不得改写声明

#### Scenario: 并发准备同一 runtime
- **WHEN** 多个 Workspace 或任务同时准备相同版本与平台的 Node runtime
- **THEN** Buildr MUST 使用确定性 ownership/lock 与原子替换避免部分安装
- **AND** 成功调用方 MUST 观察到同一通过 probe 的完整 runtime
