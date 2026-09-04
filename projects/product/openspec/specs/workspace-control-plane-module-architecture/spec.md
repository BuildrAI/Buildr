# workspace-control-plane-module-architecture Specification

## Purpose

定义 Workspace、Agent Assets 与产品资源 Infrastructure 的模块 owner、协作入口和行为等价约束。

## Requirements

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

### Requirement: Agent Assets 与产品资源技术能力必须分离
Buildr Service MUST 将 Builtin、Component、Skill、Command package maintenance 与 runtime projection 编排归入 Agent Assets owner；manifest 读取、产品资源路径映射、文件枚举/复制等通用产品资源能力 MUST 归入 Infrastructure product-resources，且后者 MUST NOT 解释 Agent Assets 业务语义。

#### Scenario: package maintenance owner
- **WHEN** Agent 执行 `package check`、`package build`、资产同步或 runtime projection
- **THEN** 调用 MUST 通过 Agent Assets 的 Application/module 入口完成
- **AND** package maintenance MUST 保持原有 manifest、source、projection 和 writer authority

#### Scenario: product resource query
- **WHEN** Agent Assets 需要读取产品 manifest 或随包资源
- **THEN** MUST 使用 product-resources 提供的受约束 resource/path capability
- **AND** product-resources MUST NOT 创建 Workspace、Task 或 Agent Assets 业务事实

### Requirement: 结构迁移必须保持外部行为等价
Workspace Control Plane 结构迁移 MUST 保持现有 `init`、mutation recovery、`package check/build`、`sync`、`render`、Doctor、Environment preparation、runtime projection、错误映射和安全边界行为等价。

#### Scenario: CLI 行为等价
- **WHEN** 在相同 fixture 上运行迁移前后代表性 Workspace、package、sync 与 render 命令
- **THEN** 命令入口、成功/失败分类、JSON shape、写入 authority 和预期资源结果 MUST 等价

#### Scenario: 旧路径清理
- **WHEN** 新 owner 已接管全部调用点并通过结构与行为验证
- **THEN** 旧全局 `package-assets`、`workspace-operations` 路径 MUST 被删除或明确不再可导入
- **AND** 静态架构检查 MUST 不发现旧路径引用、重复 writer 或新的循环依赖

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

### Requirement: Project与Service创建必须由所属Application拥有
Workspace owner MUST让Project和Service各自的Application拥有创建、附接、物化、identity冲突检查、Manifest更新与Workspace mutation编排。CLI contribution MUST调用同一Application，不得保留CLI专用writer或第二套Manifest兼容实现。

#### Scenario: 创建Managed Project
- **WHEN**Project命令创建Workspace-owned或Git-managed Project
- **THEN**Project Application MUST核对目标、source、已有Registry和Git identity后在一个Workspace mutation中物化并更新Project Registry
- **AND**失败时 MUST保持现有staging清理、冲突拒绝和已有内容保护语义

#### Scenario: 创建或附接Service
- **WHEN**Service命令创建、复制或附接Service
- **THEN**Service Application MUST核对Project、Service source、Git root、remote、integration branch和重复来源
- **AND**Service Repository MUST是Services Manifest解析、兼容映射和写入的唯一owner

#### Scenario: CLI contribution组装
- **WHEN**Workspace module建立Project与Service CLI contribution
- **THEN**descriptor MUST注入对应Application API给所属CLI Adapter
- **AND**module MUST不依赖CLI Adapter向私有组合登记Project/Service业务方法
