## Context

首轮每日演进已经落地：权威文件在 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`，一天一份可覆盖，Web 只读，写入前必须同步。当时的产品边界是「推进项必须挂已有 Task」且「产品不扫描 Git」，因此没创建任务、只在主工作区提交的工作不会进入日报。

用户要回答的是项目日问题：今日新增了什么、更新了什么、删除了什么、有什么弊端。输入改为当天 Git 提交与更改文件；摘要仍由 Agent 判断后写入；作者归属用本机 `git config user.email` 对比 commit author email。

## Goals / Non-Goals

**Goals:**

- 把日报输入锚定到目标日期的 Git 提交与更改文件；日摘要固定四问。
- Task 关联改为 0..N 可选；自己的提交可挂已有 Task 并跳转；他人提交必须展示且禁止挂 Task。
- 产品 Application / HTTP GET / Web 仍只读已保存 YAML，不现场 `git log` 合成。
- 项目详情继续用第三 Tab、前一天/后一天与 DatePicker；内容改为日摘要、提交列表、变更文件。

**Non-Goals:**

- 产品核心不执行 Git 扫描、不读取 `user.email`、不推断 Task、不内置 cron。
- 不把未提交 working tree 改动自动算进日报。
- 不把每日演进文件纳入 Git / Content Target / Task SQLite。
- 不自动迁移已有 v1 YAML；需要 Agent 重跑覆盖。

## Decisions

### 1. Agent 收集 Git，产品只校验已构造 payload

Skill 在同步成功后，于 Project 对应 Git 范围收集目标日期（本机日历日或显式 `--date`）的全部 commits 与 path 变更，读取 `git config user.email`，比较时大小写不敏感、去掉首尾空白。Agent 据此撰写四问摘要，判断自己的提交是否关联已有 Task，再调用 `record`。

产品 Application 不调用 Git。它只接受 closed payload：日摘要、提交列表（含 author email、声明的 `authorship: self|other`、可选 taskIds）、变更文件并集。GET/inspect 只读文件。

备选是 HTTP GET 现场 `git log`。否决：读取路径会把未判断的 Git 历史当成日报，也绕过「仍由 Agent 写入」。

### 2. 文件 schema 升到 v2，v1 不自动兼容展示

新权威 schema：`buildr.project-daily-progress/v2`。必填：`daySummary`（added / updated / deleted / drawbacks）、`commits`、`files`。`commits[].taskIds` 允许空数组。他人提交带非空 taskIds 时整次 fail closed。

inspect 遇到 v1 文件时返回明确 incompatible/not-displayable，Web 当作需要 Agent 重跑的空态提示，不把旧推进项假装成提交列表。同一天成功 record 仍整文件覆盖。

### 3. 作者归属以写入时的 email 快照为准

`authorship` 由 Agent 在 record 前写入。产品校验枚举与「other 不得带 Task」，不在读取时重跑 `git config`。换机器或改 email 不会改写历史文件。

自己的提交：0..N 个本机已存在 Task；有 Task 的芯片可导航。没有 Task 的自己提交仍展示。他人提交只展示作者与 subject，不出现 Task 芯片。

### 4. Web 主视图改为四问 + 提交 + 文件

项目详情第三 Tab 保留。按日：先日摘要四块，再提交列表，再变更文件。按人：按 commit author 分组。按任务：只聚合 `taskIds` 非空的自己提交；未关联提交进入明确「未关联任务」分组；他人提交不进入任务分组。Task 详情只列出引用了该 Task 的提交/摘要，不列出他人提交。

DatePicker（`#progress-date`、只读输入、不可清空）与前后一天按钮保留。`#progress-body` 内仍无写入控件。空态文案改为：需要 Agent 同步后收集当日 Git 再写入；页面不会根据 Git 自动填充。

### 5. 非 Git Workspace

没有 Git 的 Workspace：Skill 在同步门禁后说明无法收集提交，不得伪造 commits，也不得调用带空 Git 输入的 record 来假装「今日无事」。用户仍可在有 Git 的 Project 范围重试。

## Risks / Trade-offs

- **未提交改动不进日报** → 接受；日报回答的是已提交事实，working tree 交给 Agent 在摘要弊端里说明。
- **email 配置错误会把自己标成他人** → 接受；以本机 `user.email` 为准，Skill 写明对比规则。
- **merge commit / 跨时区 author date** → 按 commit author date 的本机日历日过滤；设计不解析 squash 前历史。
- **v1 文件不再可展示** → 用 incompatible 提示重跑，避免错误信息架构。
- **Agent 仍可能漏提交或错挂 Task** → 产品只保证结构与 other 禁 Task；内容对错留在 Agent。

## Migration Plan

- 无自动迁移。旧 v1 文件保留在 ignored 目录，inspect 提示重跑。
- 同一天 `record` 覆盖为 v2。
- 测试、JSON identity、Skill、Web smoke 一并改为新 payload；`#app-view` README tab 仍 0 个 input，每日演进 tab 的 `#progress-body` 仍 0 个 input。

## Open Questions

- 无。日期过滤、email 对比、可选 Task、读取不扫 Git，以及日摘要四问（新增 / 更新 / 删除 / 弊端）已由用户确认。
