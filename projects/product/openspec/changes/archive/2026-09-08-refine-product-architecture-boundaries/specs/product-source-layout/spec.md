## MODIFIED Requirements

### Requirement: Product 顶层目录必须按生命周期分离
Buildr Product Service MUST 使用 `bin/`、`src/`、`resources/`、`test/`、`tools/` 和 `docs/` 分别承载可执行入口、产品源码、文件型交付资源、测试验证、checkout-only 工程程序和文档。`web-dist/`与各服务 `build/` 生成目录 MAY 仅作为精确 ignore、可删除并可重建的本地构建输出存在；`package/` MUST NOT 再承载 tracked 人工源码或文件型交付 authority。Buildr/Buildr Web `build/generated/*-dto.ts` MUST由Schema在构建前生成且MUST NOT进入tracked tree。

#### Scenario: 检查完成迁移的 Product checkout
- **WHEN** architecture verifier扫描Product Service顶层和tracked files
- **THEN** `bin/`、`src/`、`resources/`、`test/`、`tools/`和`docs/` MUST各自只包含其声明生命周期内的tracked内容
- **AND** `web-dist/`、`build/` 目录 MUST没有tracked文件并由精确ignore覆盖
- **AND** `package/` MUST不存在tracked人工源码或文件型交付资源
- **AND** tracked source、test、package metadata、docs和active OpenSpec artifacts MUST NOT把本地生成目录描述为源码authority

#### Scenario: 本地构建物化忽略输出
- **WHEN** 维护者从干净checkout运行声明的开发构建入口
- **THEN** builder MAY在已登记ignored路径物化生成物供本地消费
- **AND** Git tracked/index状态 MUST不因构建输出改变

### Requirement: Workspace 后端分层必须通过私有组合显式装配
Workspace 模块 MUST 在 `src/modules/workspace` 的扁平技术层中维护纯 Domain、职责明确的 Repository 与 Application、CLI/HTTP Interface、Workspace Management Fence 与唯一 `module.ts` 组合入口。Workspace、Project、Service MUST分别保持独立领域和Application。`module.ts` MUST只选择已声明依赖、建立模块私有组合、提供稳定 capability 并组合 Interface contributions；MUST NOT保存业务实现，或通过进程级共享 runtime method catalog 充当第二 Application。

#### Scenario: 组装 Workspace 后端
- **WHEN** `src/modules/workspace/module.ts` 创建 Workspace capability
- **THEN** 它 MUST以明确依赖和Runtime type组合 Manifest/Registry Repository、Workspace/Project/Service Application 与 Fence
- **AND** 所属 Interface MUST消费明确 Application API并贡献 CLI、HTTP或diagnostic descriptor
- **AND** 公开 capability identity、CLI、HTTP、JSON、YAML、错误、事务与 writer authority MUST保持兼容

#### Scenario: 按职责拆分源文件
- **WHEN** Workspace Application 文件同时包含独立变化的读取、写入、Prompt生成或diagnostic职责
- **THEN** 实现 MUST同时依据层边界、文件变化原因和实际体量决定拆分或合并
- **AND** Project、Service、Fence或Daily Progress文件在领域独立、职责单一且体量可维护时 MUST保留完整用例而不机械细拆

#### Scenario: 过渡 CLI 边界
- **WHEN** Bootstrap 构建 Workspace 命令目录
- **THEN** Workspace、Project、Service命令 MUST只来自 `modules/workspace` 的 Interface contribution；Daily Progress命令 MUST来自 `modules/task/daily-progress` 的 Interface contribution
- **AND** 旧 `src/workspace` 路径或共享 runtime method 注入 MUST不再存在
## ADDED Requirements

### Requirement: 工程检查与业务读取能力必须分开装配
Buildr 自身源码布局、包静态验证和场景检查 MUST位于 `tools/verification/` 或测试工程中，不得放在产品资产应用中。工作空间对资产管理 MUST提供只包含真实消费者所需方法的 support，不得传递全量业务和测试方法集合；诊断 MUST只取得必要读取能力，内置资产检查 MUST固定使用检查模式。

#### Scenario: 检查模块装配
- **WHEN** 创建工作空间、资产和诊断模块
- **THEN** Workspace 资产 support MUST不包含任务方法、每日演进方法或测试专用 writer
- **AND** 诊断 MUST不取得内置资产同步写入入口，必需方法缺失 MUST在装配时显式失败

#### Scenario: 开发者执行包检查
- **WHEN** 在 Buildr 开发检出执行 `buildr package check`
- **THEN** 命令 MUST调用工程检查入口并保留选择、输出与失败语义
- **AND** 正式安装没有开发检查源码时 MUST给出需要开发检出的明确提示，不加载源码外的猜测路径

