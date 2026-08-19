# 项目每日演进

按 Project 把 Agent 总结的当日推进项存成本机 YAML，并与已有 Task 做 n:n 关联。

## 背景与问题

当前认知说明产品现在是什么样，Task Record 保存目标与生命周期，都不是「今天推进了什么」。日报如果进 Task 库或 Git，会和本机 Task、跨机器共享边界缠在一起。

## 目标

- 每个已登记 Project 在 `.buildr/daily-progress/<project-code>/` 下一天一份文件，可覆盖重跑。
- 推进项必须挂 1..N 个本机已有 Task；Web 可按日、人、任务查看。
- 写入前先同步最新代码；产品不写摘要、不内置 cron。

## 非目标

- 不进 Task SQLite，不建人员名册，不做 Server/Cloud 共享。
- 不扫描 Git、不推断作者、不替代 Task 状态或当前认知。

## 受影响用户或角色

- 通过 Agent 生成或重跑日报的人。
- 在 Buildr Web 查看某 Project 当天推进的人。

## 核心流程

1. Agent 同步最新代码，失败则停止。
2. Agent 总结推进项并提交 record。
3. Application 校验 Project/日期/Task ID 后覆盖当天文件。
4. Web/CLI 只读展示；Task 详情可反查。

## 关键变化

新增本机文件权威、产品 Skill、Agent-machine CLI 与项目/任务只读视图。

## 影响 / 风险 / 兼容性

本机 Task ID 不能跨机器解析。同一天重跑覆盖旧摘要。无破坏性 API 删除。

## 验收摘要

- 未登记 Project 或未知 Task ID 零写入。
- 同一天第二次 record 覆盖且不影响其他日期。
- ignore 条目存在；Web 空态不自动合成日报。

## 技术 artifacts

- Change：`openspec/changes/introduce-project-daily-progress/`
- 规范：`specs/project-daily-progress/spec.md` 及 CLI/Web/Skill delta specs
