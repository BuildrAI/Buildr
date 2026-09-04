## MODIFIED Requirements

### Requirement: Workspace Control Plane 必须有唯一业务 owner
Buildr Service MUST 将 Workspace/Project/Service registry、onboarding、mutation recovery 与 declaration-intake application 编排归入 Workspace owner；Workspace owner MUST 不拥有 Agent Assets、Task、Verification 或 Public JSON Contract 的 writer。Workspace、Project 与 Service MUST保持各自独立的领域和Application边界。Workspace module MUST使用只包含已声明依赖的私有组合对象装配Repository、Application与Workspace Management Fence，并 MUST NOT 将内部能力写入进程级共享runtime或通过未声明的任意方法查找取得能力。

#### Scenario: Workspace application 组装
- **WHEN** Buildr 启动 CLI、HTTP Host 或 Application payload
- **THEN** Bootstrap MUST 通过 Workspace module 的公开 Application/Query 入口组装 Workspace 控制面
- **AND** Workspace module MUST 在唯一组合边界显式构造 Repository、Application、Fence 与 Interface contribution
- **AND** Bootstrap MUST NOT 直接注册旧的全局 `package-assets` 或 `workspace-operations` writer

#### Scenario: 跨模块读取 Workspace 事实
- **WHEN** Agent Assets 或 Task 相关模块需要 Workspace/Project identity 或 registry 查询
- **THEN** 调用 MUST 经过 Workspace 提供的窄 Query 入口
- **AND** 调用方 MUST NOT 直接导入 Workspace Persistence、SQLite connection 或声明 writer

#### Scenario: Workspace 模块内部依赖检查
- **WHEN** 架构验证扫描 Workspace Repository、Application、Fence 与 module composition
- **THEN** 每个实现 MUST 只访问其Runtime type或构造边界声明的依赖
- **AND** 验证 MUST允许模块私有组合使用受约束的方法登记，并拒绝进程级共享runtime mutation、隐式全局方法或未声明依赖

### Requirement: Workspace Query 必须是稳定窄的只读入口
Workspace owner MUST 提供面向后续Task Execution/Verification的稳定Workspace/Project Query；Query MUST只返回必要identity、registry与规范化路径事实，不暴露业务Persistence、SQLite、writer、Repository或可变 runtime handle。Workspace、Project 与 Service MUST先保持独立Application边界；每个领域只有在职责混杂且实际体量需要时才拆分Query/Command文件，不得为目录对称机械拆分。

#### Scenario: Query consumer
- **WHEN** 后续 Task 模块查询 Workspace/Project/Service
- **THEN** MUST 能通过公开 Query 获得所需只读事实
- **AND** Query 返回值 MUST 不包含内部 connection、repository、absolute machine state 或可变 writer handle

#### Scenario: Query 边界回归
- **WHEN** 运行 Workspace Control Plane 架构 contract tests
- **THEN** 测试 MUST 验证 Query 的公开 surface、owner 依赖方向和不直接依赖 Persistence 的约束
- **AND** 测试 MUST 不以 Project 或 Service 是否拆成独立 Query/Command 文件判断边界是否成立
