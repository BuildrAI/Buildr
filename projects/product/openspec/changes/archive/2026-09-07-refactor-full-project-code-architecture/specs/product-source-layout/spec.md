## MODIFIED Requirements

### Requirement: Product 顶层目录必须按生命周期分离
Buildr Product Service MUST 使用 `bin/`、`src/`、`resources/`、`test/`、`tools/` 和 `docs/` 分别承载可执行入口、产品源码、文件型交付资源、测试验证、checkout-only 工程程序和文档。`web-dist/`与明确登记的 generated 目录 MAY 仅作为精确 ignore、可删除并可重建的本地构建输出存在；`package/` MUST NOT 再承载 tracked 人工源码或文件型交付 authority。Buildr/Buildr Web `src/**/generated/*-dto.ts` MUST由Schema在构建前生成且MUST NOT进入tracked tree。

#### Scenario: 检查完成迁移的 Product checkout
- **WHEN** architecture verifier扫描Product Service顶层和tracked files
- **THEN** `bin/`、`src/`、`resources/`、`test/`、`tools/`和`docs/` MUST各自只包含其声明生命周期内的tracked内容
- **AND** `web-dist/`、登记的DTO/generated目录 MUST没有tracked文件并由精确ignore覆盖
- **AND** `package/` MUST不存在tracked人工源码或文件型交付资源
- **AND** tracked source、test、package metadata、docs和active OpenSpec artifacts MUST NOT把本地生成目录描述为源码authority

#### Scenario: 本地构建物化忽略输出
- **WHEN** 维护者从干净checkout运行声明的开发构建入口
- **THEN** builder MAY在已登记ignored路径物化生成物供本地消费
- **AND** Git tracked/index状态 MUST不因构建输出改变

### Requirement: Product 源码必须按职责和依赖方向分层
Buildr `src/` MUST 使用 `bootstrap/`、`modules/`、`web/` 与 `infrastructure/` 分别承载对象装配、产品能力、公共网页宿主与通用技术机制。`modules/` MUST 按真实产品能力组织，并在模块内部按需要使用 `domain/`、`application/`、`persistence/`、`infrastructure/` 和 `interfaces/`；每个技术层 MUST 默认扁平，只有稳定子模块、多个需要独立维护的私有协作者或明确实现分类时才能建立末级目录。Buildr MUST 保持 Interface 调用 Application、Application 组合 Domain/Persistence/Infrastructure、纯 Domain 不依赖 adapter 的方向，并 MUST NOT 为目录对称创建空层、单文件目录、重复实现或旧内部路径 facade。

#### Scenario: CLI 或本机应用调用 Workspace 用例
- **WHEN** CLI、HTTP 或 Web adapter 读取或修改 Workspace
- **THEN** Interface MUST 调用 `modules/workspace` 的公开 Application capability
- **AND** Domain MUST NOT 导入 CLI、HTTP、Web、filesystem、process、runtime、persistence 或测试模块
- **AND** Application MUST NOT 依赖具体 Interface implementation

#### Scenario: 迁移带文件操作的旧领域 handler
- **WHEN** 旧模块同时包含用例编排、filesystem 读取或 mutation
- **THEN** 用例编排 MUST 进入所属模块的 Application owner
- **AND** 业务文件映射 MUST 进入所属模块 Persistence，通用文件机制 MUST进入全局 Infrastructure
- **AND** Product MUST NOT 为目录对称创建没有真实模型职责的空 Domain 层

#### Scenario: 架构 verifier 扫描 imports
- **WHEN** Product 验证检查 Bootstrap、Modules、Web 与 Infrastructure 的 import graph
- **THEN** verifier MUST拒绝反向依赖、循环依赖、业务模块绕过公开 capability 导入其他模块内部实现，以及产品源码依赖 `tools/` 或 `test/`
- **AND** 诊断 MUST 标识违规 source、target module 与规则

#### Scenario: Task Record 作为首个纵向切片完成迁移
- **WHEN** architecture verifier 检查 Task Record 的 Domain、Application、Persistence、CLI/HTTP Adapter 和模块注册入口
- **THEN** 这些实现 MUST 仅存在于 `src/modules/task/` 的对应技术层，并由 `src/modules/task/module.ts` 提供单一运行时注册入口
- **AND** 旧 `src/task/` 与全局技术层 MUST NOT 保留实现、re-export 或兼容 facade
- **AND** Task Record 公开 CLI/HTTP/JSON、SQLite schema、事务、错误映射和唯一 writer MUST 保持不变

#### Scenario: 已迁移模块包含单文件末级目录
- **WHEN** 架构 verifier 在模块技术层中发现只包含一个能力文件的末级目录
- **THEN** 该目录 MUST具有多个私有协作者、真实子模块或明确实现分类之一的可验证理由
- **AND** 无上述理由的文件 MUST位于对应技术层根目录

### Requirement: Task Record 分层实现必须保持明确文件职责
Task Record MUST在`src/modules/task`的扁平技术层中维护普通Domain数据类、Application DTO与用例、四个单表Repository、HTTP/CLI Interface和唯一模块注册。Infrastructure MUST提供唯一普通SQLite TransactionManager；Application MUST拥有业务规则、完整DTO组装和事务范围并直接组合四个Repository；CLI/HTTP MUST只调用Application。Domain MUST不包含协议解析或业务流程，Repository MUST不调用其他Repository或管理transaction，HTTP MUST不为同形Application DTO保留复制mapping。

#### Scenario: 扫描 Task Record 后端源码
- **WHEN** 架构 verifier 扫描 `src/modules/task` 的 Task Record import graph 与文件清单
- **THEN** Domain MUST不依赖Application、Persistence、Interfaces或Infrastructure
- **AND** `task.ts`、`task-project.ts`、`task-service.ts`与`task-change.ts` MUST是全部Task Record Domain文件
- **AND** Interfaces MUST只通过Application API读取或修改Task Record
- **AND** `src/task` MUST不存在

#### Scenario: Bootstrap 注册 Task Record
- **WHEN** `src/modules/task/module.ts` 组装 Task Record
- **THEN** 它 MUST注入同一TransactionManager、四个独立Repository、Project/Service reader、Task-scoped Change resolver与其他明确协作者
- **AND** 对其他模块公开的Task Record Application与窄兼容读取能力 MUST保持当前调用行为

#### Scenario: 普通业务模块使用 SQLite 事务
- **WHEN** Task Record、Task Review或Task Verification执行普通SQLite mutation
- **THEN** 对应Application MUST决定transaction范围并使用Infrastructure TransactionManager
- **AND** 业务Persistence文件 MUST不再重复实现`BEGIN IMMEDIATE|COMMIT|ROLLBACK`

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
- **THEN** Workspace、Project、Service与Daily Progress命令 MUST只来自 `modules/workspace` 的 Interface contribution
- **AND** 旧 `src/workspace` 路径或共享 runtime method 注入 MUST不再存在

### Requirement: 模块必须通过显式窄合约参与组装
每个业务模块 MUST通过 `src/modules/<module>/module.ts` 人工源码提供稳定 closed descriptor，显式声明具名 `requires`、`provides`、CLI/HTTP/diagnostic contributions 和可选 lifecycle。Bootstrap MUST显式选择依赖并装配模块，模块 MUST NOT通过扫描、导入副作用、共享 runtime method catalog 或任意全局 lookup取得能力。

#### Scenario: Bootstrap 创建 Task Record 模块
- **WHEN** Bootstrap 装配 Task Record
- **THEN** `src/modules/task/module.ts` MUST只接收 Structured Workspace Store、Project/Service Reader、Task-scoped Change Resolver、operation memoizer和适用 Parent Coordination Reader等已声明依赖
- **AND** 模块 MUST提供唯一 Task Record Application API、当前兼容所需的窄 Persistence Read Port及自身 CLI/HTTP contributions
- **AND** Bootstrap、CLI Host与HTTP Host MUST NOT直接导入 Task Record内部 Application或Persistence实现

#### Scenario: 模块声明无效
- **WHEN** 两个模块或 contributions使用重复identity、required依赖缺失、descriptor包含非法字段或 lifecycle 不完整
- **THEN** Bootstrap MUST在执行业务命令或启动长期资源前 fail closed
- **AND** 诊断 MUST标识冲突模块、capability或contribution identity

#### Scenario: 模块拥有生命周期资源
- **WHEN** 一个模块提供真实 `start` 与 `stop` lifecycle
- **THEN** Bootstrap MUST按确定性注册顺序启动模块并按逆序停止
- **AND** 启动中途失败时 MUST只逆序释放已经成功启动且由本次Bootstrap拥有的资源

### Requirement: 退役任务模块不得保留人工源码或兼容转发
Task Overview、Task Development、Task Planning Identity、Task Environment、Task Execution Record、legacy Task Finish 与 Terminal Delivery 的 Domain、Application、Persistence、Interface、fixture、helper 和专属测试 MUST直接删除。`src/modules/task` 中保留的 Task Record、Task Review、Task Verification 与父任务协调 Domain、Application、Repository、CLI、HTTP 和 module ports MUST使用 TypeScript 单一人工源码并通过 strict typecheck；共享生产组合与验证基础也 MUST使用 TypeScript 单一人工源码。

#### Scenario: 扫描生产与测试源码
- **WHEN** source layout verification 扫描受影响路径
- **THEN** 退役模块 MUST没有 `.mjs|.js|.ts` 实现或 compatibility wrapper
- **AND** `src/modules/task` 保留 TypeScript 源码 MUST没有 `@ts-nocheck`，公共输入 MUST从 `unknown` 收窄且公共边界不得使用无约束 `any`

#### Scenario: 构建Application Payload
- **WHEN** current TypeScript source 生成 CLI/runtime payload
- **THEN** 生成 JavaScript 与声明 MUST只作为构建产物
- **AND** MUST不形成第二人工源码或运行时 TypeScript 依赖

### Requirement: Workspace CLI必须按独立领域调用Application
Workspace、Project与Service CLI Adapter MUST分别位于`src/modules/workspace/interfaces/cli/`并只负责所属命令的参数解析、Application调用、CLI输出和语法错误。Interface MUST NOT直接解析或写入Workspace/Project/Service Manifest、执行Git clone/copy身份决策、决定Workspace mutation范围或复制Application业务校验。

#### Scenario: Project创建命令
- **WHEN**用户执行`buildr project create`
- **THEN**Project CLI Adapter MUST把参数映射为Project Command Application输入
- **AND**Project Application MUST通过Project Repository与现有Git/filesystem Infrastructure完成创建或附接
- **AND**CLI MUST不直接导入YAML、Project Domain writer或Manifest Repository实现

#### Scenario: Service创建命令
- **WHEN**用户执行`buildr service create`
- **THEN**Service CLI Adapter MUST把参数映射为Service Command Application输入
- **AND**Service Application MUST通过Service Repository与现有Git/filesystem Infrastructure完成创建、附接或复制
- **AND**公开命令、参数、输出、错误、Git副作用和next action MUST保持兼容

#### Scenario: 根据创建副作用边界拆分
- **WHEN**Project或Service创建用例具有独立Git/filesystem/staging/Manifest mutation与失败清理生命周期
- **THEN**对应领域 MUST由所属Application统一拥有创建职责；是否独立文件取决于重要隔离价值或实际体量，不得仅因存在独立逻辑单元就拆文件
- **AND**原Application在职责和体量仍可维护时 MUST不为Query/Command目录对称继续拆分
