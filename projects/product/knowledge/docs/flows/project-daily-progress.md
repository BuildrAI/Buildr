# 项目每日演进

每日演进帮助人按日期了解项目（Project）代码发生了什么变化。它基于明确范围的 Git 提交，由智能体（Agent）生成并保存本机摘要，Buildr Web 提供阅读入口。

这项能力已有实现，目前暂停进一步扩展，不作为首发主要使用路径。已有摘要仍可阅读和按现有方式重跑；暂停建设不意味着删除已有内容。整体范围见[当前能力与边界](../overview.md)。

## 读者会看到什么

一份摘要回答四个问题：新增了什么、更新了什么、删除了什么，以及存在哪些弊端或未覆盖范围。摘要保留提交来源、观察时间和范围说明；没有提交的工作、未提交的改动以及业务系统中的变化，不会因为查看页面而自动纳入。

工作台（Workbench）的“动态”、项目（Project）主页的“项目动态”和工作概览中的摘要进入同一阅读页面。选择项目（Project）与日期后，可以查看完整摘要和提交，按日、人或任务（Task）分组。页面不展示变更文件列表，文件路径仍保存在摘要数据中，可通过命令行接口（CLI）读取。

项目（Project）、日期和分组保存在网址（URL）中。没有指定日期时，动态页展示各项目（Project）最近一份摘要；旧 `?document=daily` 入口兼容跳转，缺省日期沿用本机今天。页面只读取已有内容，不扫描 Git，也不会因摘要缺失而自动生成。

## 查看、生成与重跑

只想查看时，可以告诉智能体（Agent）：“查看这个项目最近的每日演进。”它按 `project-daily-progress` 技能（Skill）读取已有摘要；缺失时说明情况，不擅自生成。

需要生成或重跑时，可以说：“根据当前本地提交，整理这个项目昨天的变化，注明未确认远端最新。”智能体（Agent）负责核对以下范围并执行：

1. 明确日期、时区、相关代码仓和引用，固定完整提交标识及观察时间。生成不要求工作目录干净、先更新代码、同步资产或通过全局诊断；用户要求远端最新时，才按授权获取相应引用。
2. 收集所选范围中的提交与变更文件，按本机 `git config user.email` 区分自己的提交和他人提交。自己的提交可关联已存在的本机任务（Task），他人提交必须保留展示且不能关联本机任务（Task）。
3. 撰写四问摘要，记录实际范围、观察时间、远端状态与未覆盖部分。重跑同一天前核对已有范围，不能静默缩小。
4. 通过产品能力校验并保存。查看生成结果时继续区分代码事实、智能体（Agent）的解释和仍未核实的判断。

具体命令供智能体（Agent）和选择手动方式的人参考：

```bash
buildr project daily-progress record --project <code> --input <payload.json> --json
buildr project daily-progress inspect --project <code> --date <YYYY-MM-DD> --json
buildr project daily-progress list --project <code> --json
```

输入字段以[每日演进规范](../../../openspec/specs/project-daily-progress/spec.md)和当前命令帮助为准。应用层（Application Layer）接收已经整理的内容，不替智能体（Agent）执行 `git log`。

## 本机保存与失败边界

摘要保存在 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml`，由产品写入能力校验后原子替换，不应手工构造保存文件。它不进入任务（Task）的 SQLite，也不随 Git 同步。关联只针对当前机器已有任务（Task），不代表跨成员共享的任务（Task）历史。

未登记项目（Project）、非法日期、未知任务（Task）身份或错误的提交关联会使本次保存失败，保留原文件。无法获取用户必需的提交范围时，保留旧摘要并说明缺口；无关的本地改动和诊断问题不应阻止有依据的摘要写入。

旧 v1 摘要会标记为 `incompatible`，需由智能体（Agent）重新生成。定时调用需要使用者自己的智能体（Agent）宿主安排，Buildr 不内置定时调度。数据位置与恢复限制见[本机数据说明](../architecture/buildr-data-design.md)。

## 依据与实现入口

流程依据[每日演进规范](../../../openspec/specs/project-daily-progress/spec.md)与[随包技能（Skill）](../../../services/buildr/resources/workspace/skills/buildr/project-daily-progress/SKILL.md)。后端实现位于 [`src/modules/task/daily-progress/`](../../../services/buildr/src/modules/task/daily-progress/)；网页由[动态页面](../../../services/buildr-web/src/features/workbench/pages/WorkbenchActivityPage.tsx)、[每日演进面板](../../../services/buildr-web/src/features/project-daily-progress/components/DailyProgressPanel.tsx)和[导航处理](../../../services/buildr-web/src/features/project-daily-progress/dailyProgressNavigation.ts)承载。
