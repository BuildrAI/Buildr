## Why

人需要按日看到某个 Project 推进了什么，并把 Agent 总结的工作切片关联到已有 Task。Buildr 现有的当前认知只解释「产品现在是什么样」，Task Record 只保存目标与生命周期，两者都不是日报。v1 先做本机可见、可重复生成的每日演进，不进入 Task SQLite，也不假装能跨机器共享 Task。

## What Changes

- 新增本机文件权威：每个已登记 Project 在 `.buildr/daily-progress/<project-code>/` 下每天一份 YAML，同一天重复执行覆盖当天文件。
- Agent 在写入前必须先同步最新代码；同步或基线失败则不写当天文件。
- 每个推进项通过 Task ID 与本机 Task Record 做 n:n 关联；署名只是显示名，不建人员名册。
- Buildr 提供确定性 Application/CLI/只读 Web 展示；摘要内容由 Agent 生成，产品不扫描 Git、不推断作者、不内置 cron。
- 目录必须被 Git 忽略，不进入 Content Target，也不成为组织协作 authority。
- 本变更不包含破坏性变化。

## Capabilities

### New Capabilities

- `project-daily-progress`: 定义本机每日演进文件位置、一天一份可覆盖、推进项与 Task 的 n:n 关联、署名维度、写入前同步、Agent/产品边界以及 CLI/Web 只读展示。

### Modified Capabilities

- `product-agent-skills`: 新增产品 Skill，引导 Agent 先同步代码再生成并提交当天演进。
- `cli-product-surface`: 登记每日演进的 Agent-machine CLI。
- `public-json-contracts`: 为 record/inspect/list 与 Web 读取提供公开 JSON identity。
- `local-workspace-application`: 为本机 HTTP 增加 Project-scoped 只读每日演进 API。
- `local-app-web-client`: 项目详情按日/人/任务展示每日演进，Task 详情可反查关联推进项。

## Impact

- Buildr Application、CLI、package Skill、`.gitignore` 模板与 init/sync。
- 本机 HTTP 只读 API 与 Buildr Web 项目/任务页面。
- Product 当前认知（概览、产品/技术架构、术语、Buildr/Buildr Web Service 说明）。
- 不修改 Task Record schema、Workspace SQLite Task 表，也不引入 Person registry 或 SQLite 同步。
