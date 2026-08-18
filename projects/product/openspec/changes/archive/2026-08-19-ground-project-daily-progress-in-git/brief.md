# 项目每日演进改为 Git 提交输入

把项目日报从「必须挂 Task 的推进项」改成「以当日 Git 提交与改动文件为输入的四问摘要」，Task 关联改为可选。

## 背景与问题

首轮每日演进不扫描 Git，且推进项必须关联已有 Task。没创建任务、只在主工作区提交的工作不会进入日报，无法回答「今日新增了什么、更新了什么、删除了什么、有什么弊端」。

## 目标

- Agent 同步后拉取目标日期全部 Git 提交与更改文件，对比本机 `git config user.email`，总结四问后再 `record`。
- 自己的提交可挂 0..N 个已有 Task 并跳转；他人提交必须展示且禁止挂 Task。
- 产品读取路径仍只读已保存 YAML，不现场 `git log` 合成。

## 非目标

- 产品核心不执行 Git 扫描、不读 `user.email`、不内置 cron。
- 不把未提交改动自动算进日报，不把 YAML 纳入 Git/Content Target/Task SQLite。
- 不自动迁移 v1 文件。

## 受影响用户或角色

- 通过 Agent 生成或重跑日报的人。
- 在 Buildr Web 查看某 Project 当天提交与摘要的人。

## 核心流程

1. Agent 同步最新代码，失败则停止。
2. Agent 收集当日 commits/files，对比 `user.email`，撰写四问并判断自己的提交是否关联 Task。
3. Application 校验 payload 后覆盖当天 v2 文件。
4. Web/CLI 只读展示；空态不根据 Git 自动填充。

## 关键变化

- **BREAKING**：Task 关联从必填改为可选；schema 升到 v2。
- 项目详情主视图改为日摘要、提交列表、变更文件。

## 影响 / 风险 / 兼容性

v1 文件不可直接展示，需 Agent 重跑覆盖。email 配错会把本人标成他人。未提交工作不会进日报。

## 验收摘要

- 空 Task 的自己提交可写入；他人提交带 Task 被拒绝。
- GET/空态不扫描 Git。
- 自己的已关联提交可跳转 Task；他人提交无芯片。

## 技术 artifacts

- Change：`openspec/changes/ground-project-daily-progress-in-git/`
- 规范：`specs/project-daily-progress/spec.md` 及 CLI/Web/Skill delta specs
- 预演：`ui-preview/project-daily-progress.html`
