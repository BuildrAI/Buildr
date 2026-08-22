## Why

Buildr Service 的前三批模块迁移已经进入 `dev`，但公共 JSON helper、release version、内部工作流路由、Web HTTP host 和少量 Bootstrap/全局旧路径仍没有最终 owner。现在需要完成最后一批结构收敛，避免这些残留继续形成跨模块入口，同时保持所有公开行为与安全边界不变。

本变更不包含破坏性变更。

## What Changes

- 将现有公共 JSON schema identity registry 与 envelope helper 迁入明确的基础设施 contract owner；不引入 JSON Schema、Ajv、DTO 生成或 typed client。
- 将 release version 领域规则迁入 `system/installation/domain`，由 Release Awareness 和 release tools 继续复用同一实现。
- 将内部工作流 route catalog 与 route router 迁入 Task 模块，清单只描述 route，router 只分发到 Task internal runners，真正用例继续由 Task Application Service 执行。
- 将单体 Web HTTP server 拆为 server lifecycle、router、session/request security、responses 与 static files 等窄职责，保持 Session、Origin、请求体上限、Secret、静态资源、shutdown 和响应行为等价。
- 收敛 Bootstrap 仅负责模块组合，删除无 owner 的顶层 `application`、`domain`、`interfaces` 生产残留，更新 owner map、测试与旧路径断言。
- 复核第三 Child 已交付的 Task Execution/Verification owner 与旧路径结果，并在本 Child 的 Parent Contribution Handoff 中显式 supersede 其缺失的 Parent evidence；不重做或改写其历史实现。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `public-json-contracts`: 明确现有 schema identity registry 与 envelope helper 的唯一 contract owner，保持 payload identity 和输出行为不变。
- `system-installation-module-architecture`: 将 release version 规则归入 System Installation Domain，并保持 Release Awareness 与 release tools 复用。
- `task-execution-module-boundaries`: 明确 internal workflow route catalog、router 与 Task Application Service 的职责边界。
- `product-source-layout`: 收紧 Bootstrap 组合职责并要求删除无 owner 的顶层生产残留。
- `local-workspace-application`: 在既有本机 HTTP 安全与行为契约内增加 Web HTTP host 职责拆分要求。

## Impact

- 主要影响 `services/buildr/src` 下的 contracts、System Installation、Task internal interfaces、Web HTTP 与 Bootstrap 组装代码。
- 更新关联的单元、契约、集成和 System HTTP 安全回归测试，以及架构边界和发布工具引用。
- CLI、HTTP path/method/DTO、public JSON identity、SQLite、事务、锁、运行副作用、writer authority 与 Verification 语义保持不变。
- 后续 `evolve-buildr-http-contract-system` 仍独立承担完整 JSON Schema、Ajv、DTO 自动生成与 typed client。
