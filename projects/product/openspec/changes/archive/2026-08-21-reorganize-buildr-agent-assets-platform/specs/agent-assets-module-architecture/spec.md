## ADDED Requirements

### Requirement: Agent Assets 形成独立一级模块
Buildr Service MUST 将 Rule、Skill、Command、Component、Builtin、Capability Binding、Agent runtime adapter 与 runtime projection 的生产实现归入 `src/agent-assets/` 一级模块，并 MUST 按真实技术职责组织其 Application、Infrastructure 与 Interfaces。

#### Scenario: 查看生产源码归属
- **WHEN** 维护者检查 Buildr Service 的 Agent Assets 实现
- **THEN** Rule、Skill、Command、Component、Builtin、Capability Binding 和 runtime projection 的业务编排 MUST 可从 `src/agent-assets/` 定位
- **AND** 已迁移职责 MUST NOT 在通用 `src/application/domains` 或全局 `src/infrastructure/runtime` 保留第二套生产实现

#### Scenario: 保留真实复杂子目录
- **WHEN** package maintenance 或 runtime Skill projection 包含多个独立私有协作者
- **THEN** Agent Assets 模块 MUST 允许在对应技术层中保留专属子目录
- **AND** 模块 MUST NOT 为视觉对称创建没有真实职责的空 Domain、Persistence 或 Interfaces 层

### Requirement: Agent Assets 模块保持事实 authority 分离
Agent Assets 模块 MUST 保持 Workspace 源资产、Component lifecycle、Builtin source、Capability Binding 与 Agent runtime projection 的既有 authority，不得因代码进入同一模块而合并 writer 或把投射结果提升为源资产。

#### Scenario: 渲染 Agent runtime
- **WHEN** Buildr 从 Workspace Rules、Skills、Components 和 capability context 生成 Agent runtime
- **THEN** Workspace manifests 与资产内容 MUST 继续作为源资产 authority
- **AND** runtime receipt 与 Agent 原生目标文件 MUST 继续作为可重建投射结果
- **AND** projection MUST NOT 取得源资产 writer authority

#### Scenario: 维护 Commands
- **WHEN** Agent Assets 处理 Command definitions 或 Project Command requirements
- **THEN** Commands MUST 继续只声明和检查外部工具
- **AND** Agent Assets MUST NOT 因模块迁移安装、升级或保存外部工具凭证

#### Scenario: 执行 Component lifecycle
- **WHEN** Buildr 安装、更新或卸载 Component
- **THEN** Component MUST 继续以集合级预检、唯一 ownership 和原子 source transaction 管理全部成员
- **AND** runtime reconcile MUST 继续发生在 source transaction 成功之后

### Requirement: Bootstrap 显式安装 Agent Assets 模块
Bootstrap MUST 只通过 `agent-assets/module.mjs` 或等价公开入口安装 Agent Assets 平台，并 MUST 保持既有 CLI、HTTP、diagnostic 与 lifecycle 组装行为。

#### Scenario: 创建普通 CLI runtime
- **WHEN** Bootstrap 创建 Buildr runtime
- **THEN** Bootstrap MUST 恰好安装一次 Agent Assets 模块
- **AND** CLI registry MUST 继续解析既有 Rule、Skill、Command、Component、Builtin、runtime、render 和 sync 命令
- **AND** Help、JSON、错误映射与退出行为 MUST 保持等价

#### Scenario: 退出 legacy direct registration
- **WHEN** Agent Assets 模块已经由 Bootstrap 安装
- **THEN** `legacy-runtime-module` MUST NOT 再逐项直接注册已迁移的 Agent Assets Application
- **AND** 迁移期兼容方法 MUST 由 Agent Assets 模块公开入口唯一提供

### Requirement: Runtime adapter 与投射行为保持等价
Agent Assets 模块 MUST 保持受支持 runtime adapter、render/sync plan、冲突预检、receipt、清理和诊断行为等价，并 MUST 继续复用全局 Infrastructure 的通用文件、进程、网络与原子写入机制。

#### Scenario: 投射前发现冲突
- **WHEN** 任一 planned runtime target 与非 Buildr-managed 文件冲突
- **THEN** Agent Assets MUST 在写入任何 planned target 前失败
- **AND** MUST 报告当前 scope 内全部已发现冲突

#### Scenario: 重复 render 或 sync
- **WHEN** Agent 对相同源资产和 adapter 重复执行 render 或 sync
- **THEN** Agent Assets MUST 复用 receipt 判定受管文件 identity
- **AND** MUST 只清理仍由 matching receipt 证明 ownership 的旧投射
- **AND** MUST 保持幂等结果

#### Scenario: 运行 runtime adapter discovery
- **WHEN** Agent 运行现有 runtime list、check、render 或 sync 入口
- **THEN** 支持的 adapter、trait、recommended commands、投射目标和诊断语义 MUST 与迁移前等价

### Requirement: 迁移同步覆盖发布物、诊断与文档
Agent Assets 平台迁移 MUST 原子更新所有生产 imports、Application Payload、Doctor/Verification 消费路径、测试与 Buildr 服务架构文档，并 MUST 保持发布物逻辑身份和运行行为等价。

#### Scenario: 构建 Application Payload
- **WHEN** Buildr 从开发 checkout 生成 Application Payload 或 npm candidate tarball
- **THEN** payload MUST 包含 Agent Assets 模块及其 runtime collaborators
- **AND** Node 24 package entry MUST 能继续加载全部公开 Agent Assets 命令和 runtime 行为
- **AND** 发布物 MUST NOT 依赖已退出的旧生产路径

#### Scenario: 阅读服务架构文档
- **WHEN** 维护者阅读 `docs/architecture/service-architecture.md`
- **THEN** 文档 MUST 展示 Agent Assets 的实际目录结构、职责边界和迁移状态
- **AND** MUST 明确产品入口 Buildr Skill、Workspace Builtin 与 package runtime source 的长期关系仍不由本结构迁移决定

#### Scenario: 检查旧路径
- **WHEN** 结构验证扫描生产源码和直接消费者
- **THEN** 已迁移 Agent Assets 文件的旧路径 MUST 不再被引用
- **AND** 不得存在重复实现或新增循环依赖
