# workspace-control-plane-module-architecture Specification

## Purpose

定义 Workspace、Agent Assets 与产品资源 Infrastructure 的模块 owner、协作入口和行为等价约束。

## Requirements

### Requirement: Workspace Control Plane 必须有唯一业务 owner
Buildr Service MUST 将 Workspace/Project/Service registry、onboarding、mutation recovery 与 declaration-intake application 编排归入 Workspace owner；Workspace owner MUST 不拥有 Agent Assets、Task、Verification 或 Public JSON Contract 的 writer。

#### Scenario: Workspace application 组装
- **WHEN** Buildr 启动 CLI、HTTP Host 或 Application payload
- **THEN** Bootstrap MUST 通过 Workspace module 的公开 Application/Query 入口组装 Workspace 控制面
- **AND** Bootstrap MUST NOT 直接注册旧的全局 `package-assets` 或 `workspace-operations` writer

#### Scenario: 跨模块读取 Workspace 事实
- **WHEN** Agent Assets 或 Task 相关模块需要 Workspace/Project identity 或 registry 查询
- **THEN** 调用 MUST 经过 Workspace 提供的窄 Query 入口
- **AND** 调用方 MUST NOT 直接导入 Workspace Persistence、SQLite connection 或声明 writer

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
Workspace owner MUST 提供面向后续 Task Execution/Verification 的稳定 Workspace/Project Query；Query MUST 只返回必要 identity、registry 与规范化路径事实，不暴露业务 Persistence、SQLite、Environment Receipt 或 Verification Result writer。

#### Scenario: Query consumer
- **WHEN** 后续 Task 模块查询 Workspace/Project/Service
- **THEN** MUST 能通过公开 Query 获得所需只读事实
- **AND** Query 返回值 MUST 不包含内部 connection、repository、absolute machine state 或可变 writer handle

#### Scenario: Query 边界回归
- **WHEN** 运行 Workspace Control Plane 架构 contract tests
- **THEN** 测试 MUST 验证 Query 的公开 surface、owner 依赖方向和不直接依赖 Persistence 的约束
