# workspace-node-toolchain Specification

## Purpose

定义 Workspace Node version 的数据归属、初始化选择、本机受管 runtime、确定性解析、恢复与显式升级边界。

## Requirements

### Requirement: Workspace 必须持有精确 Node version
Buildr MUST 在受版本控制的 Workspace metadata 中保存精确 `major.minor.patch` Node version，并 MUST 将它作为 Workspace Node identity 的唯一版本 authority。`package.json#engines.node` MUST 只表达产品兼容范围 `>=24.15.0 <25`；Agent runtime、普通 `PATH`、Task Finish 状态和机器绝对路径 MUST NOT 决定或保存 Workspace Node version。未来 Node 主版本 MUST 经过独立适配和验证后才能明确加入产品兼容范围。

#### Scenario: 解析 canonical Node 声明
- **WHEN** Buildr 读取包含 `runtime.node.version` 的 canonical Workspace metadata
- **THEN** Buildr MUST 验证版本是满足产品兼容范围的精确版本
- **AND** MUST 返回由 Workspace id、版本、platform、arch 和 identity schema 构成的稳定 Node identity

#### Scenario: 声明不合法
- **WHEN** Node version 缺失、不是精确版本或不满足 `engines.node`
- **THEN** Buildr MUST 将 Workspace Node 声明标记为 invalid 或 migration-required
- **AND** MUST NOT 从 PATH 选择另一版本并把 Workspace 视为 runtime-ready

#### Scenario: 支持已验证的 Node 24
- **WHEN** npm 或开发入口运行在 Node 24.15.0 或更高的 Node 24 版本
- **THEN** Buildr MUST 将该版本视为满足产品兼容范围
- **AND** Workspace 受管 runtime MUST 继续使用 metadata 声明的精确版本

#### Scenario: 拒绝尚未验证的未来主版本
- **WHEN** npm 或开发入口运行在 Node 25 或更高主版本
- **THEN** Buildr MUST 将该版本视为不满足当前产品兼容范围
- **AND** 错误信息 MUST 指明当前支持 Node 24.15.0 至 25 之前

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

### Requirement: Workspace Node 升级必须显式发生
Buildr MUST 只在受版本控制的 Workspace metadata 明确改变时采用新 Node version；普通 `sync`、`doctor`、Agent runtime render 和 Finish MUST NOT 自动改变声明。

#### Scenario: sync 面对可用的新版本
- **WHEN** 上游存在比 Workspace 声明更新的兼容 Node
- **THEN** `sync` MUST 继续使用并收敛声明版本
- **AND** MUST NOT 查询或采用最新版本
