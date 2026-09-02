## Why

Task Review 仍使用调用方提供的 target identity 派生 current/stale，并被 Task Development 作为 Candidate 与 Handoff 的门禁；Application 还生成工作提示词。这样一个本应由 Agent 按真实对象执行的可选审查，被做成了研发流程状态和第二判断来源，也没有并发覆盖保护。

## What Changes

- 将 Planning/Completion Review 保留为两个可选 current Result；Agent与Skill负责选择真实审查对象、使用代码/Git/文件/外部工具完成审查。
- Result v2只保存审查对象身份、method、实际覆盖、未覆盖、发现、局部结论和完成时间；`inspect`不接收target、不派生适用性。
- `record`必须携带`expectedCurrentDigest`，以`absent`或已观察Result digest做事务内CAS，拒绝覆盖并发更新。
- 一次SQLite migration把现有v1 current rows转换为v2唯一结构；`ready|changes-required`转换为`accepted|changes-requested`，不保留双读。
- 删除Review后端prompt接口、生成DTO和Application方法；Buildr Web继续只读并生成最小Agent指令。
- 删除Task Development对Review Application、Planning/Completion gate和Review Result的current依赖；Review缺失或结论变化不再阻止Candidate、decision或handoff。
- `buildr.task-development`提升到v4，明确退役v3对Task Review的required依赖；Receipt v3数据结构只做兼容演进，旧gate仍为历史decode。
- 删除仍宣称`task next`和旧Review gate的canonical规范与专属测试假设。
- 保留和修改的Review实现及专属测试迁移到TypeScript单一人工源码。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-review-results`: Result v2、真实subject、无适用性派生、CAS写入与一次迁移。
- `task-review-module-architecture`: Review模块端口和TypeScript owner边界。
- `task-development`: 删除Review/gate消费，保留自身研发事实。
- `task-professional-http-contracts`: 删除Task Review prompt operation与DTO。
- `buildr-web-workspace-application`: Review只读展示和本地Agent action。
- `product-agent-skills`: Task Review Skill按真实现场完成审查，不要求Development。
- `workspace-structured-data-store`: v1 current rows迁入v2 schema。
- `public-json-contracts`: Review operation result升级并删除已退役Task Entry声明。

## Impact

影响Buildr Task Review Domain/Application/Repository/CLI/HTTP/module、Task Development Review消费、Buildr Web Review投影、SQLite migration、公共JSON、随包Skills、current knowledge与测试。不会新增审批、通用许可、审查历史表、自动唤醒、统一状态机或外部系统副本。
