## ADDED Requirements

### Requirement: Host Node 与 Workspace Node 必须分离生命周期
Buildr 当前 MUST 将 npm Host Node 与 Workspace Node 视为两个不同 runtime role。Host Node MUST 由 npm consumer 管理并只受 `engines.node` compatibility 约束；Workspace Node MUST 只由版本化 Workspace 声明、`sync` 与 Workspace-owned execution 生命周期管理。版本、平台与 architecture 相同 MUST NOT 合并其 identity、ownership、更新或卸载事实。Product Node 不属于当前正式产品 runtime。

#### Scenario: npm Buildr 进入 Workspace
- **WHEN** npm package 由兼容 Host Node 启动并处理一个声明 Workspace Node 的 Workspace
- **THEN** Buildr 主进程与 npm-owned Launcher MUST 继续使用 formal installation 绑定的 Host Node
- **AND** MUST NOT 因声明版本可用而以 Workspace Node 重启或替换主进程

#### Scenario: npm 产品升级
- **WHEN** npm 更新 Buildr package 或刷新 Launcher binding
- **THEN** Workspace metadata 与已准备 Workspace Node identity、path 和 directory digest MUST 保持逐字节不变
- **AND** npm update/Launcher repair MUST NOT 删除、替换、升级或重新登记 Workspace runtime

#### Scenario: Workspace Node 升级
- **WHEN** 维护者显式修改 `.buildr/workspace.yml` 中的精确 Node version 并执行准备
- **THEN** npm Host Node、package installation identity 与 Launcher binding MUST 保持不变
- **AND** 新 Workspace Node MUST 只影响该声明拥有的 Workspace-owned subprocess

## MODIFIED Requirements

### Requirement: Workspace Node 执行证据必须声明 runtime role
任何使用 Node 的 Workspace-owned executor MUST 记录 `workspace` runtime role、声明版本、platform、architecture、executable identity 与 Workspace id；npm 主进程与 Launcher MUST 记录 `host` role。Resolver MUST NOT 以 PATH 顺序、文件名或版本相同推断两个 role 相同，且当前 evidence MUST NOT 声称存在 `product` role。

#### Scenario: 验证和 Finish 执行
- **WHEN** Project verification 或 Finish adapter 通过 Workspace Node 运行
- **THEN** execution context MUST 报告 Workspace Node identity 与声明来源
- **AND** MUST NOT 把当前主进程 Host Node 路径记录为 Workspace Node，除非其独立 ownership identity 精确匹配且仍保持不同 role

#### Scenario: Launcher 启动主进程
- **WHEN** 用户从 npm-owned Launcher 启动 Buildr Web
- **THEN** version/health/status MUST 报告主进程为 `host` 并绑定 Launcher installation identity
- **AND** Workspace-owned 子进程 MUST 继续单独报告 `workspace` role

## REMOVED Requirements

### Requirement: Product Node、host Node 与 Workspace Node 必须分离生命周期
**Reason**: Product Node 已退出当前正式产品；仅 npm Host Node 与 Workspace Node 是当前 runtime role。
**Migration**: 使用新增的 Host Node/Workspace Node lifecycle separation requirement；未来 Product Node 需新的 Change。

#### Scenario: 移除当前 Product Node role
- **WHEN** Buildr 解析当前 runtime roles
- **THEN** MUST 只把 npm Host Node 与 Workspace Node 作为正式当前 role
