# 项目每日演进

## 当前流程

1. 用户要求展示、生成或重跑某已登记 Project 的每日演进时，Agent 发现 `project-daily-progress` Skill。
2. 写入前先做与「更新 workspace」相同的同步：Git 管理的 Workspace 把安全 Git update 交给 `buildr.git-operations/v1`，成功后再 `buildr sync <agent>`。working tree dirty、冲突、upstream 不明、provider blocked 或 Doctor 未 ready 时停止，不调用 record。
3. 同步成功后，Agent 收集目标日期全部 Git 提交与更改文件，用本机 `git config user.email` 做大小写不敏感对比。自己的提交 `authorship: self`，可挂 0..N 个已存在 Task ID；他人提交 `authorship: other`，必须写入且不得挂 Task。再撰写四问：`added`、`updated`、`deleted`、`drawbacks`。不要手写 YAML，不要写入 Task SQLite。
4. 调用 `buildr project daily-progress record --project <code> --input <payload.json> --json`。Application 校验 Project、日期、closed v2 payload 与存在的 Task ID 后，原子覆盖 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。他人提交带 Task 或任一存在引用的 Task 不存在时整次 fail closed，不写文件。产品 Application 不执行 `git log`。
5. CLI `inspect`/`list`、本机 HTTP 与 Buildr Web 只读展示。项目详情第三 Tab「每日演进」展示四问、提交与变更文件，可切日期并按日/人/任务分组；按任务只聚合已关联的自己的提交。Task 概览只反向展示已关联该 Task 的提交。v1 文件标 incompatible，需 Agent 重跑覆盖。空态交给 Agent，页面不根据 Git 自动填充。

## 失败与停止

- 未登记 Project、非法日期、未知 Task ID 或他人提交挂 Task：零写入。
- 同步失败：当天文件保持调用前状态。
- 产品读取路径不根据 Git 或 Task 列表合成日报，也不提供 cron；定时再次调用属于 Agent 宿主。
