## Why

现有任务验证把项目测试执行、Task Development、Candidate、Execution Record、资源调度和风险决定耦合成通用流程，既重复项目自身测试体系，也阻碍智能体根据真实改动直接选择工具。现在需要把边界收敛为“项目测试地图 + 智能体执行 + 最终报告”，并删除旧通用执行平台与所有外围依赖。

## What Changes

- **BREAKING**：`verification.yml`升级为`buildr.project-verification/v4`项目测试地图，只声明稳定测试体系、发现位置、完整入口和资源要求，不登记每个测试文件，也不表达Task执行计划。
- 新增Project Verification Application的`inspect`、`validate`、`update`接口；Application只校验和按已观察identity写入Agent形成的候选声明。
- **BREAKING**：Task Verification Application只保留`record`与`inspect`，保存一份绑定Task范围、内容版本和当前测试地图的有意义完成报告；Application校验check与Task/可用测试地图的一致性，地图缺失或损坏时只形成`map-unavailable`与gap，不丢弃真实测试事实。
- **BREAKING**：删除`verification plan/run/cleanup`、`task verification reconcile`、自动测试选择、通用执行器、资源调度、Candidate/generation/lease、Development policy、`proceed/blocked`、workspace-only特殊分支及整个Task Execution Record产品模块。
- Task Development、Task Finish、Task Entry、Terminal Delivery和其他消费者不再把Task Verification作为流程依赖、门禁或Candidate事实；需要展示报告的入口只读取独立报告。
- 历史Task Verification current数据迁移为新报告结构；整个Task Execution Record的记录、正文、恢复、配额、retention、GC、CLI、HTTP和Web能力退出。
- 后端、前端、Skill、CLI、HTTP、Buildr Web、SQLite、当前知识文档和项目自身测试声明同步到新边界。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `task-verification`：从通用计划、执行与reconciliation平台改为独立的完成报告Application。
- `project-test-capabilities`：项目声明改为v4测试地图与Agent候选维护接口。
- `task-development`：删除Verification policy、gate、readiness、Candidate绑定和Task Verification依赖。
- `task-execution-artifacts`：整体退役Task Execution Record及其metadata、正文、恢复、retention、cleanup与GC能力。
- `task-execution-module-boundaries`：删除Task Execution Record模块边界，Project Verification只保留测试地图职责。
- `task-professional-http-contracts`：Task Verification HTTP只提供报告读取和提示，不接收Candidate/target/declaration编排输入。
- `cli-product-surface`：删除全局Verification执行命令，增加Project测试地图维护命令并收窄Task命令。
- `product-agent-skills`：Task Verification Skill改为指导Agent探查、选择、执行和形成最终报告。
- `buildr-web-workspace-application`：证据页展示独立任务验证报告，删除Execution Record面板和HTTP读取入口。

## Impact

- 影响Buildr Service的Task Verification、Project Verification、Task Development、Task Execution Record、CLI、HTTP、SQLite migration和测试模块。
- 影响Buildr Web任务证据页与Agent action。
- 影响`buildr.task-verification`契约、相关Skill、`verification.yml`模板和Product当前测试地图。
- 旧命令与全部Task Execution Record能力被删除；项目自有runner、DAG和资源管理仍可作为项目测试实现，由Agent直接调用。
