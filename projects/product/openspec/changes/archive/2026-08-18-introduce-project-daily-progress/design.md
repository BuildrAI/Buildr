## Context

Buildr Local 的 Task Record 在 Workspace SQLite 中，不进 Git、不能跨机器共享。当前认知解释已确认产品事实，不是日报。用户需要按 Project 查看每天推进了什么，由 Agent 总结推进项，并与已有 Task 做 n:n 关联。

已确认的产品决定：v1 本机关联；文件放在 `.buildr/daily-progress/<project-code>/`，不进 Task 同库；一天一份、可覆盖重跑；自动执行取决于 Agent 宿主定时器；跑之前同步最新代码。

## Goals / Non-Goals

**Goals:**

- 为每个已登记 Project 保存本机每日演进文件，一天一份，重复执行覆盖当天。
- 推进项与本机 Task Record 以 Task ID 做 n:n 关联；Web 可按日、人、任务切开看。
- Agent 负责摘要；Buildr 负责校验、落盘、解析 Task 和只读展示。
- 写入前先做授权范围内的最新代码同步；失败则不写当天文件。
- 文件被 Git 忽略，不进入 Content Target，也不成为共享 authority。

**Non-Goals:**

- 不把每日演进写入 Task SQLite，不新增 Person/成员名册。
- 不通过 Git 或拷贝 SQLite 分享 Task 或每日演进。
- 产品不内置 cron，不扫描 Git 提交、不推断 commit author。
- 不替代当前认知、Task 状态、Verification 或 Retrospective。
- 不在 v1 做 Server/Cloud 协作。

## Decisions

### 1. 文件权威，不进 Task 库

每日演进的权威是 Workspace 根下的本机 YAML 文件：

```text
.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml
```

`<project-code>` 必须是已登记 Project。日期是本机日历日，除非调用方显式传入日期。同一天再次 record 原子覆盖该文件，不保留 run 历史。

不使用 Task SQLite：避免把日报生命周期耦进 Task Record，也避免把「人/日」查询做成第二套 Task schema。读取时用 Task ID 去本机 Task Record 解析标题与状态；写路径在任一 Task ID 不存在时 fail closed。读路径若 Task 之后消失，展示未解析引用，不改写文件。

备选方案是同库表或 Git 文档。前者违反「不同库」决定；后者会把本机 Task ID 变成伪共享主键。v1 都不采用。

### 2. 推进项是摘要切片，Task 仍是目标

推进项（Progress Item）是 Agent 对「今天实际推进了什么」的总结单元，不是 Task，也不是当前认知。一条推进项必须包含非空摘要、可选署名、以及 1..N 个已有 Task ID。一个 Task 同一天可以出现在多条推进项中。

署名是自由显示名，只用于「按人」分组。产品不校验它是否等于 Git author、Agent identity 或未来 Cloud 账号。

### 3. Agent 写摘要，产品写文件

Buildr 不生成日报正文。产品 Application 只接受已构造的 closed payload：校验 schema、Project、日期、Task ID 集合，再原子写入。Skill 负责：

1. 按「更新 workspace」同步最新代码（Git 管理时 fetch/rebase 到已核验 upstream，需要时 `buildr sync`）；
2. 根据本机 Task 与当前 tree 总结推进项；
3. 调用 Application record。

同步 dirty、冲突、upstream 不明或 Doctor 未 ready 时停止，不覆盖当天文件。产品不内置定时器；Cursor Automation / 会话 loop 若存在，只是再次调用同一 Skill。

### 4. Web 只读，挂在项目详情

不新增顶栏导航。项目详情增加「每日演进」视图，默认今天，可切换日期，并按人、按任务分组。Task 详情展示反向关联：哪些推进项提到了该 Task。页面不提供写入；需要生成时交给 Agent。

本机 HTTP 只读，复用既有 session/同源边界，不接受任意路径，不暴露本机绝对路径。

### 5. 忽略规则与控制元数据

`/.buildr/daily-progress/` 必须写入 root `.gitignore`，init/sync 幂等补齐。Workspace 根 `.buildr/**` 已排除在 Content Target 之外，日报文件不得进入 Task Contribution。Doctor 可以把目录存在但未被忽略视为 finding，但不能把文件缺失当成远端数据丢失。

## Risks / Trade-offs

- **本机 Task ID 不能跨机器解析** — 接受；共享要等 Server/Cloud。
- **覆盖重跑会丢掉当天旧摘要** — 接受；v1 不要 run 历史。
- **署名无法证明身份** — 接受；只是展示维度。
- **同步失败会整天没有文件** — 优于在旧代码上写出误导日报。
- **Agent 摘要质量不可由产品证明** — 产品只保证结构、Task 引用和落盘；内容对错留在 Agent。

## Migration Plan

- 新 Workspace：`init` 写入 ignore 条目。
- 旧 Workspace：`sync`/`update` 幂等补齐 ignore，不迁移历史文件。
- 无历史数据，无需双写或回读 SQLite。
