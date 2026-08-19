# 隐藏每日演进变更文件展示

项目详情「每日演进」只读展示四问与提交，不再展示变更文件列表；YAML/`files` 与 CLI inspect 仍保留。

## 背景与问题

按日视图把路径清单与四问、提交并列，噪音大、可读性差。规范仍要求 MUST 展示变更文件，与产品选择冲突。

## 目标

- Web 按日/按人/按任务均不渲染「变更文件」。
- 更新 OpenSpec 展示承诺；同步当前认知表述。
- 保留 record/`files` 写入与只读 API 返回，供 Agent 证据与后续恢复。

## 非目标

- 不从 schema/YAML/HTTP 删除 `files`。
- 不改四问、提交、分组、Task 关联或 DatePicker。
- 不做 UI Preview。
- 不改 CLI `record` 对 `files` 的校验与保存。

## 受影响用户或角色

- 在 Buildr Web 阅读某 Project 每日演进的人。
- 继续用 Agent/CLI 写入与 inspect `files` 的协作者。

## 核心流程

1. Agent 仍同步 Git、总结四问并 `record`（含 `files`）。
2. Web 只读读取当天文件，展示四问与提交，忽略 `files`。
3. 需要路径清单时用 CLI inspect 或本地 YAML。

## 关键变化

展示承诺从「必须展示变更文件」改为「必须展示四问与提交，且不得展示变更文件」。存储与 API 形状不变。

## 影响 / 风险 / 兼容性

已有含 `files` 的 v2 文件继续可读。依赖页面扫路径做审查的人需改看 CLI/YAML。

## 验收摘要

- 有当天文件时，页面有四问与提交，无「变更文件」标题或路径列表。
- inspect JSON 仍可含 `files`；重跑 record 仍可写入 `files`。
- knowledge 中「提交与变更文件」的展示表述已对齐。

## 技术 artifacts

- Change：`openspec/changes/hide-daily-progress-changed-files/`
- 规范：`specs/project-daily-progress/spec.md`、`specs/local-app-web-client/spec.md`
- 实现：`services/buildr-web/.../DailyProgressPanel.tsx`
