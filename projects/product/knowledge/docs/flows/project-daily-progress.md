# 项目每日演进

当前实现归属后端 `src/modules/task/daily-progress/`，由任务模块装配项目查询、任务查询和每日演进数据访问。单机版任务记录只在本地，Git 提交是跨开发者同步输入，因此仍按提交汇总，再关联本地任务。未来企业版任务主导汇总不在当前流程中。

## 当前流程

1. 用户要求查看、生成或重跑某已登记 Project 的每日演进时，Agent 发现 `project-daily-progress` Skill。只查看时直接读取已有日报，缺失则报告，不自动生成。
2. 生成前明确日期、时区、相关仓库及本地引用，固定完整提交标识与观察时间。日报不要求工作目录干净、代码更新、资产同步或全局诊断通过；需要远端最新信息时按授权独立获取引用。用户只接受远端最新且获取失败时保留旧日报；使用本地范围时明确未确认远端最新。
3. 范围明确后，Agent 收集目标日期、时区与所选引用范围内的全部 Git 提交与更改文件，用本机 `git config user.email` 做去空白、大小写不敏感对比。自己的提交 `authorship: self`，可挂 0..N 个已存在 Task ID；他人提交 `authorship: other`，必须写入且不得挂 Task。再撰写四问：`added`、`updated`、`deleted`、`drawbacks`，在 `daySummary.drawbacks` 中保存引用、完整提交标识、截至时间、远端状态和未覆盖范围。不要手写 YAML，不要写入 Task SQLite。重跑同一天前核对已有范围，不静默缩小。
4. 调用 `buildr project daily-progress record --project <code> --input <payload.json> --json`。Application 校验 Project、日期、closed v2 payload 与存在的 Task ID 后，原子覆盖 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`。他人提交带 Task 或任一存在引用的 Task 不存在时整次 fail closed，不写文件。产品 Application 不执行 `git log`。
5. CLI `inspect`/`list`、本机 HTTP 与 Buildr Web 只读展示。项目主页的“项目动态”进入 `/activity?project=<code>`；工作概览和动态中的摘要链接携带项目与摘要日期，在同一动态页打开完整每日演进，不再作为项目资料在副屏阅读。详情展示四问与提交（不展示变更文件列表；路径清单仍保存在 YAML/`files`），可切日期并按日/人/任务分组；项目、日期和分组保存在网址（URL）中，刷新和返回保留阅读范围。按任务只聚合已关联的自己的提交。旧 `?document=daily` 地址兼容进入同一动态页，未指定日期时沿用本机今天。生成或重跑指令携带当前项目和所选日期，空态不根据 Git 自动填充。任务（Task）概览不展示每日演进反向关联；v1 文件标为 `incompatible`，由智能体（Agent）重跑覆盖。

页面入口与日期传递见[每日演进导航](../../../services/buildr-web/src/features/project-daily-progress/dailyProgressNavigation.ts)，完整阅读由[动态页面](../../../services/buildr-web/src/features/workbench/pages/WorkbenchActivityPage.tsx)与[每日演进面板](../../../services/buildr-web/src/features/project-daily-progress/components/DailyProgressPanel.tsx)协作承载。

## 失败与停止

- 未登记 Project、非法日期、未知 Task ID 或他人提交挂 Task：零写入。
- 无法取得真实提交、引用不明确或无法满足用户必需范围：当天文件保持调用前状态；本地未提交内容和无关诊断不阻止合法日报写入。
- 产品读取路径不根据 Git 或 Task 列表合成日报，也不提供 cron；定时再次调用属于 Agent 宿主。
