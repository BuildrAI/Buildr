## ADDED Requirements

### Requirement: Product Node、host Node 与 Workspace Node 必须分离生命周期
Buildr MUST 将平台 Product Node、npm host Node 与 Workspace Node 视为三个不同 runtime role。Product Node MUST 随整个平台产品单元升级或卸载；host Node MUST 由 npm consumer 管理并只受 `engines.node` compatibility 约束；Workspace Node MUST 只由版本化 Workspace 声明、`sync` 与 Workspace-owned execution 生命周期管理。版本、平台与 architecture 相同 MUST NOT 合并其 identity、ownership、更新或卸载事实。

#### Scenario: 平台 Buildr 进入 Workspace
- **WHEN** self-contained 平台 Buildr 从任意 cwd 打开或选择一个声明不同 Workspace Node 的 Workspace
- **THEN** Buildr 主进程 MUST 继续使用 embedded Product Node
- **AND** 只有 Workspace-owned npm、verification、Finish adapter 与项目子进程 MUST 使用声明的 Workspace Node

#### Scenario: npm Buildr 进入 Workspace
- **WHEN** npm package 由兼容 host Node 启动并处理一个声明 Workspace Node 的 Workspace
- **THEN** Buildr 主进程 MUST 继续使用相同 host Node
- **AND** MUST NOT 因声明版本可用而以 Workspace Node 重启或替换主进程

#### Scenario: 产品升级
- **WHEN** installer 将 Product Node 或 Buildr version 升级
- **THEN** Workspace metadata 与已准备 Workspace Node identity MUST 保持逐字节不变
- **AND** installer MUST NOT 删除、替换、升级或重新登记 Workspace runtime

#### Scenario: Workspace Node 升级
- **WHEN** 维护者显式修改 `.buildr/workspace.yml` 中的精确 Node version 并执行准备
- **THEN** Product Node、npm host Node 和平台/npm installation identity MUST 保持不变
- **AND** 新 Workspace Node MUST 只影响该声明拥有的 Workspace-owned subprocess

### Requirement: Workspace Node 执行证据必须声明 runtime role
任何使用 Node 的 Workspace-owned executor MUST 记录 `workspace` runtime role、声明版本、platform、architecture、executable identity 与 Workspace id；平台/npm 主进程状态 MUST 分别记录 `product` 或 `host` role。Resolver MUST NOT 以 PATH 顺序、文件名或版本相同推断两个 role 相同。

#### Scenario: 验证和 Finish 执行
- **WHEN** Project verification 或 Finish adapter 通过 Workspace Node 运行
- **THEN** execution context MUST 报告 Workspace Node identity 与声明来源
- **AND** MUST NOT 把当前主进程 Product/host Node 路径记录为 Workspace Node，除非其独立 ownership identity 精确匹配且仍保持不同 role

