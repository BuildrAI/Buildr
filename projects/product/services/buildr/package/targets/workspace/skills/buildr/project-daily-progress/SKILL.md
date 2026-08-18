---
name: project-daily-progress
description: 用户要求展示、生成或重跑某 Project 的每日演进，或询问能否每天自动执行时使用；先同步最新代码，再收集当日 Git 提交与更改文件，由 Agent 总结四问后通过 CLI 写入本机文件。读取路径不扫描 Git、不写 Task Record、不提供产品 cron。
---

# 项目每日演进

本 Skill 帮助 Agent 展示或生成 **项目每日演进（Project Daily Progress）**：按已登记 Project 把当天 Git 提交驱动的四问摘要写入本机 YAML。页面只读；摘要由 Agent 判断后撰写，Buildr 只校验、落盘、解析 Task。

它不是当前认知、Task 状态、Verification 或 Retrospective。产品 Application / HTTP GET **不**扫描 Git 提交、不读取 `git config user.email`、不根据 Task `updatedAt` 自动写摘要，也不内置 cron。写入前由本 Skill 收集 Git。

## 1. 先同步最新代码

写入前必须执行与「更新 workspace」相同的同步门禁：

1. 若 Workspace 由 Git 管理，把已选定 upstream 的安全 Git update 交给 `buildr.git-operations/v1`（workspace update）。working tree dirty、分叉冲突、upstream 不明或 provider `blocked` 时停止，**不要调用 record**。
2. 成功后再运行 `buildr sync <agent>`。最终 Doctor 未 ready 时停止，**不要调用 record**。
3. 非 Git Workspace 跳过 Git update，但仍须在 sync/Doctor 适用时保持当前资产 current。没有 Git 时不得伪造 commits，也**不要调用 record**。

同步失败时报告 blocked 原因，当天每日演进文件必须保持调用前状态。

## 2. 收集当日 Git 并由 Agent 总结

同步成功后：

1. 收集目标日期（本机日历日或用户指定 `YYYY-MM-DD`）的全部 Git 提交与更改文件。
2. 读取本机 `git config user.email`，与 commit author email 做大小写不敏感、去空白比较。
3. 自己的提交 `authorship: self`，可挂 0..N 个**当前 Workspace 已存在**的 Task ID；没有 Task 也要写入。
4. 他人提交 `authorship: other`，必须写入且 **不得**挂 Task。
5. 撰写日摘要四问：`added`（新增了什么）、`updated`（更新了什么）、`deleted`（删除了什么）、`drawbacks`（有什么弊端）。

不要手写 YAML，不要写入 Task SQLite。未提交 working tree 改动不要假装已经进日报，可写在弊端里。

## 3. 通过 CLI 写入

使用 agent-machine 命令，显式指定 Project：

```text
buildr project daily-progress record --project <code> [--date <YYYY-MM-DD>] --input <payload.json> --json
buildr project daily-progress inspect --project <code> [--date <YYYY-MM-DD>] [--group day|person|task] --json
buildr project daily-progress list --project <code> --json
```

`record --schema` / `--example` 可发现 closed payload。省略日期时使用本机本地时区日历日。同一天再次成功 record 会原子覆盖当天文件，不保留 run 历史。任一 Task ID 不存在或他人提交带 Task 时整次 fail closed，不写文件。

`--input` JSON 只是一次性 CLI 输入，放在操作系统临时目录；成功后立即删除。不要写入 `.buildr/local/`、`.buildr/tmp/` 或其他受管目录。

权威文件路径是 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。该目录被 root `.gitignore` 忽略，不进 Git、不进 Content Target，也不能跨机器共享。v1 旧文件不可展示，需要按本 Skill 重跑覆盖。

## 4. 定时器属于 Agent 宿主

若用户询问能否每天自动跑：说明这取决于 Cursor Automation / 会话 loop 等 Agent 宿主定时器；它们只是再次调用本 Skill。**不要**引导实现 Buildr 产品 cron。
