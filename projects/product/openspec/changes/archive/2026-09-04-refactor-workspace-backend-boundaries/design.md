## Context

Workspace 模块已按 `domain/application/persistence/interfaces/infrastructure` 分层，但实现仍沿用早期共享 runtime 注册方式：Repository、Application、Fence 和 CLI Adapter 把方法写入同一个对象，`module.ts` 再按字符串方法名挑选公开能力。该结构让调用能运行，却不能从构造参数和返回类型确认依赖、只读边界或 writer owner。

当前 `workspace-application.ts` 有 545 行，混合 Workspace metadata、Registry、迁移、候选目录、Getting Started、Agent Prompt 和诊断。Project、Service Application 分别约 261 与 214 行，物理体量尚可，不需要为了目录对称机械拆分。729 行 CLI 与 Project/Service 创建流程属于后续独立切片，本 Change 只建立它继续迁移所需的显式后端 API。

## Goals / Non-Goals

**Goals:**

- 用声明依赖和受类型约束的私有组合替代 Workspace Repository/Application/Fence 对进程级共享 runtime 的注册。
- 只将职责混杂且体量较大的 Workspace Application 拆为 Query 与 Command。
- 保持 Project、Service 和 Daily Progress 各自独立且体量合理的 Application 文件。
- 让 `module.ts` 只做依赖选择、私有组合、稳定 capability 暴露和 contribution 组装。
- 保持现有 capability identity、方法行为、CLI、HTTP、JSON、YAML、Registry、错误和原子写入语义。

**Non-Goals:**

- 不拆分或重新设计 Project/Service 创建 CLI；下一子任务处理该 729 行文件。
- 不迁移 Buildr Web 页面。
- 不改变 Workspace、Project、Service Domain、Manifest schema、文件路径或管理 Fence 规则。
- 不新增 DI container、全局 Store、Facade、兼容双写或第二 composition root。

## Decisions

### 1. 采用 Task Record 的私有组合方式，不修改进程级共享 runtime

`workspace/module.ts` 建立只属于 Workspace 模块的 private composition，把声明的外部能力、Repository、Management Fence 和 Application 组合在其中。Repository/Application 可以像当前 Task Record 一样把方法登记到这个私有对象，但必须具有明确的 Runtime type；不得继续直接向 Bootstrap 传入的进程级共享 runtime 写入 Workspace 内部方法。

替代方案是要求所有文件统一改为工厂返回对象。它比 Task Record 当前架构多引入一种组合模式，也会把本轮重构扩大为框架替换，因此不采用。

### 2. 先按领域边界独立，再按职责和体量决定文件拆分

Workspace、Project、Service 是三个具有独立 identity、Manifest/Registry、查询、修改和迁移行为的领域，不把 Project/Service 当作 Workspace 的普通关系对象合并进同一个 Application。

当前 `workspace-application.ts` 545 行且同时包含读写、Prompt 与诊断，拆为：

- `workspace-query-application.ts`：Workspace/Registry 读取、解析、候选检查与 Getting Started 投影；
- `workspace-command-application.ts`：Registry 登记/移除、metadata 迁移与更新。

Prompt 生成和 metadata 诊断分别放入其主要依赖所在的 Query/Command 文件；只有实现后仍形成独立变化原因且使文件重新显著膨胀时，才提取具名私有协作者，不预建额外 Application。

Project 与 Service 当前分别约 261 与 214 行，各自保持 `project-application.ts` 和 `service-application.ts`。Project Daily Progress 继续是 Project 范围的独立专业能力。是否拆文件由职责混杂和实际体量共同决定，不以 Query/Command 目录对称为目标。

### 3. 稳定 capability identity，收窄实际 surface

继续提供 `workspace.application`、`project.application`、`service.application`、`workspace.query` 和 Daily Progress capability。`workspace.application` 从拆分后的 Workspace Query/Command 组合现有 surface，`workspace.query` 只暴露窄只读方法；Project/Service capability 继续保持领域独立。现有消费者不增加兼容 Facade，并在同一提交中更新依赖类型。

`workspace.query` 只包含身份、Registry、详情与规范化路径读取；不得携带 writer、Repository 或可变 runtime handle。

### 4. Interface 实现与 contribution 组合保持分离

Workspace HTTP/CLI 的参数解析和协议适配继续由 `interfaces/` 持有；类似 Task Record，CLI contribution descriptor 可以由 `module.ts` 组织，但不得把参数解析、业务修改或 Manifest 写入实现放进 module。本 Change 允许旧的大 CLI Adapter 暂时继续工作，并由后续 `refactor-workspace-cli-creation` 子任务按 Workspace、Project、Service 三个领域拆分。

### 5. 行为等价由真实消费者和现有验证证明

除结构检查外，验证覆盖 Workspace metadata、Registry、Project/Service list/detail/update、HTTP、Doctor、Agent Assets、Change/OpenSpec、Publication 和 Buildr Web 系统路径，防止只让新目录通过而遗漏 capability consumer。

## Risks / Trade-offs

- [拆开 API 后调用顺序或错误映射漂移] → 复用现有业务函数和 fixtures，先改变依赖传递，再做文件拆分。
- [保留 capability identity 却漏掉方法] → 对每个公开 surface 建立精确方法集合测试，并运行全部 Bootstrap module contract。
- [Project/Service 不拆文件被误认为未完成] → 验收依据是领域边界、依赖方向和文件职责，不是文件数量或目录对称。
- [旧 CLI Adapter 仍使用 runtime bag] → 明确限制为下一个已登记子任务的过渡边界；本 Change 不新增调用方或把它包装成长期 Facade。
- [跨模块消费者读取 writer] → 静态测试枚举 `requires/provides` 与 imports，并验证 `workspace.query` closed surface。

## Migration Plan

1. 为 Manifest/Registry Repository、Fence 和各 Application 建立明确 Runtime type，并保持原行为测试。
2. 只拆分体量和职责均超界的 Workspace Application；保持 Project、Service、Daily Progress 独立文件。
3. 重写 `workspace/module.ts` 的私有组合并保持 capability identity和 Interface contribution 组织方式。
4. 原子更新 Bootstrap 与全部 Workspace capability consumers。
5. 更新结构验证和当前认知，执行针对性测试与完整受影响验证。

本 Change 无数据库或文件数据迁移。回滚只需撤销源码、测试、规范和知识文档。

## Open Questions

无。
