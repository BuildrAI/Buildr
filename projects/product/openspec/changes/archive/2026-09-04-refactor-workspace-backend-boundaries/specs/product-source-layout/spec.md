## ADDED Requirements

### Requirement: Workspace 后端分层必须通过私有组合显式装配
Workspace 模块 MUST 在现有扁平技术层中维护纯 Domain、职责明确的 Repository 与 Application、CLI/HTTP Interface、Workspace Management Fence 与唯一 `module.ts` 组合入口。Workspace、Project、Service MUST分别保持独立领域和Application。`module.ts` MUST 只选择已声明依赖、建立模块私有组合、提供稳定 capability 并组合 Interface contributions；MUST NOT 保存业务实现，或通过进程级共享 runtime method catalog 充当第二 Application。

#### Scenario: 组装 Workspace 后端
- **WHEN** `src/workspace/module.ts` 创建 Workspace capability
- **THEN** 它 MUST 以明确依赖和Runtime type组合 Manifest/Registry Repository、Workspace/Project/Service Application 与 Fence
- **AND** 所属 Interface MUST 消费明确 Application API并贡献 CLI、HTTP或diagnostic descriptor
- **AND** 公开 capability identity、CLI、HTTP、JSON、YAML、错误、事务与 writer authority MUST保持兼容

#### Scenario: 按职责拆分源文件
- **WHEN** Workspace Application 文件同时包含独立变化的读取、写入、Prompt生成或diagnostic职责
- **THEN** 实现 MUST 同时依据层边界、文件变化原因和实际体量决定拆分或合并
- **AND** 当前职责和体量均超界的Workspace Application MUST拆分Query/Command
- **AND** Project、Service、Fence或Daily Progress文件在领域独立、职责单一且体量可维护时 MUST NOT仅为目录对称继续拆分

#### Scenario: 过渡 CLI 边界
- **WHEN** 本切片尚未迁移 Project/Service 创建 CLI 的大文件
- **THEN** 旧 Adapter MUST 只作为已登记后续子任务的显式过渡边界继续接入
- **AND** 新 Application、Repository 或其他消费者 MUST NOT新增对该共享 runtime 注册面的依赖
