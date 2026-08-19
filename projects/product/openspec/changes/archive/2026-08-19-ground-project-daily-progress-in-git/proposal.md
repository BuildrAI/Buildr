## Why

首轮每日演进把「推进项必须挂已有 Task」和「产品不扫描 Git」写成了硬边界，所以没创建任务、只在主工作区提交的工作不会进入日报。用户要回答的是「该项目今日新增了什么、更新了什么、删除了什么、有什么弊端」，输入必须是当天 Git 提交与改动文件；摘要仍由 Agent 判断后写入，页面读取时不得现场合成。

## What Changes

- **BREAKING**：推进项与 Task 的关联从 1..N 必填改为 0..N 可选。没有 Task 的提交仍可写入并展示。
- Skill/Agent **必须**在写入前拉取目标日期的全部 Git 提交与更改文件，据此总结日摘要（新增了什么 / 更新了什么 / 删除了什么 / 弊端），再调用 record。产品 Application、HTTP GET 与 Web **仍不得**现场 `git log` 合成日报。
- 写入时用本机 `git config user.email` 对比 commit author email：他人提交必须展示且 **禁止**关联 Task；自己的提交可由 Agent 判断后挂 0..N 个已有 Task，有 Task 的条目可跳转任务详情。
- 项目详情「每日演进」以日摘要、提交列表、变更文件为主视图；按人按提交作者分组，按任务只聚合已关联条目。Task 详情仍只反向展示引用了该 Task 的条目。
- 空态不变：当天文件不存在时交给 Agent，读取路径不根据 Git 或任务列表自动填充。
- 本机 YAML 权威、一天一份可覆盖、写入前同步、Git ignore、不进 Task SQLite / Content Target 的边界保持不变。

## Capabilities

### New Capabilities

- （无）本变更在已有 `project-daily-progress` 上演进，不新增 capability。

### Modified Capabilities

- `project-daily-progress`: 日报目的改为 Git 提交驱动的项目日摘要；Task 关联可选；禁止他人提交挂 Task；产品仍不在读取路径扫描 Git。
- `product-agent-skills`: Skill 必须先同步，再收集当日 commits/files，对比 `user.email` 后由 Agent 总结并 record。
- `cli-product-surface`: record 接受日摘要、提交列表、可选 Task；拒绝他人提交带 Task。
- `public-json-contracts`: inspect/record JSON 增加日摘要、提交、变更文件与作者归属；Task 关联计数可为 0。
- `local-workspace-application`: 只读 HTTP 返回上述结构，GET 仍不扫 Git。
- `local-app-web-client`: 项目详情展示日摘要、提交（自己可点 Task、他人无芯片）、变更文件；DatePicker 与空态保留。

## Impact

- Daily Progress domain/schema、Application 校验、CLI payload、产品 Skill、Buildr Web 项目/任务页与 browser smoke。
- 已有当天 YAML 若仍是「推进项必填 Task」形状，读取时需兼容或明确要求重跑覆盖。
- Product 当前认知（概览、流程、术语、Buildr/Buildr Web）需追上 Git 输入与可选 Task。
- 不把 Git 历史写入 Task SQLite，不把每日演进文件纳入 Git，也不引入产品 cron。
