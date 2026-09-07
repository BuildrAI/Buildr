## MODIFIED Requirements

### Requirement: Agent Assets 形成独立一级模块
Buildr MUST 将 Rule、Skill、Command、Component、Builtin/package maintenance 与 Agent runtime projection 的产品实现收敛到 `src/modules/agent-assets/`，并在真实需要时使用 Application、Domain、Persistence、Infrastructure 与 Interface 分层。Manifest 读写、能力图与 binding 规则、用例编排、外部执行和可重建投射 MUST具有可定位的独立 owner；旧 `src/agent-assets/` MUST不再存在实现或转发。

#### Scenario: 查看生产源码归属
- **WHEN** 维护者扫描 Agent Assets 生产源码
- **THEN** 所有业务实现 MUST位于 `src/modules/agent-assets/`
- **AND** 参数解析与输出 MUST位于 Interfaces，业务规则 MUST位于 Domain/Application，Manifest/receipt 映射 MUST位于 Persistence，adapter/render/projection MUST位于 Infrastructure

#### Scenario: 保留真实复杂子目录
- **WHEN** runtime adapter 或 package maintenance 含多个独立维护协作者
- **THEN** 实现 MAY保留真实能力子目录
- **AND** MUST不为单个小函数、同一用例的镜像类型或纯转发创建目录

### Requirement: Agent Assets 模块保持事实 authority 分离
Agent Assets MUST区分 Workspace 源资产 Manifest/文件、业务 capability binding 与依赖解析、Component source transaction、Agent runtime 派生投射及其 receipt。Application MUST决定用例顺序和失败语义；Persistence MUST拥有 Manifest/receipt 解析映射与条件写入；Domain MUST拥有 capability graph、binding、成员关系与 ownership 规则；Infrastructure MUST只执行 filesystem、进程、adapter、render 和 projection 技术动作。

#### Scenario: 渲染 Agent runtime
- **WHEN** Agent Assets 渲染或同步 runtime
- **THEN** Application MUST先解析源资产和能力图，再调用 adapter/projection Infrastructure
- **AND** runtime receipt MUST不被解释为源资产 authority
- **AND** capability graph MUST不位于 `infrastructure/runtime/skills` 或其他投射目录

#### Scenario: 维护 Commands
- **WHEN** 用户新增、删除或检查 Command definition/requirement
- **THEN** Interface MUST只解析公开参数并调用 Command Application
- **AND** Application、Domain 与 Persistence MUST分别拥有策略、规则和 Manifest 写入
- **AND** Commands MUST继续只声明和检查外部工具
- **AND** Agent Assets MUST NOT安装、升级或保存外部工具凭证

#### Scenario: 执行 Component lifecycle
- **WHEN** 用户安装或卸载 Component
- **THEN** Application MUST编排成员验证、source transaction 与 runtime reconcile
- **AND** Component MUST继续以集合级预检、唯一 ownership 和原子 source transaction 管理全部成员
- **AND** runtime reconcile MUST继续发生在 source transaction 成功之后
- **AND** 已提交源资产、运行时投射及部分失败 effects MUST保持既有事实地位和错误语义
