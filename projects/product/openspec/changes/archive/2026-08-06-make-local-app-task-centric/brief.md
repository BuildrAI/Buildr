# 在任务里看变更

## 一句话摘要

Local App 以任务为唯一工作入口：在任务概览优先阅读关联 Change 的 Brief，再按需查看完整 OpenSpec artifacts 和其他任务事实。

## 用户可见变化

- 不再有独立的“变更”菜单、变更目录或全局变更详情页。
- 打开任务后，关联 Change 的 Brief 成为概览的主要说明；一个任务有多个 Change 时分别展示。
- Change 的 proposal、design、specs 和 tasks 仍可查看，但只能从所属任务进入。
- Local App 不创建、关联、继续或审查 Change；这些工作仍由 Agent 在任务流程中推进。
- 没有关联真实任务的 Change 暂不显示或处理。

## 不改变什么

- OpenSpec 继续是 Change 内容的唯一 source authority。
- Task Record 继续只保存 Change 引用，不复制 Change 内容。
- 任务环境、研发、审查、验证和交付的既有 read model 与 authority 不改变。
