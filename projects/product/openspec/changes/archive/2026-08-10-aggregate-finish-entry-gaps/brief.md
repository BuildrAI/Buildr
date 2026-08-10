# Finish 入口聚合分类回报缺口

## 一句话摘要

Task Finish 在创建 run 前一次跑完既有 Environment / Development / 交付观察，按模块分类汇总缺口后再失败；有研发缺口不创建 run，回到 task-development。

## 背景与问题

收尾入口原先顺序 fail-fast，Agent 一次只看到第一项失败；模块检查器本身没问题，缺的是入口聚合与可读分类。

## 目标 / 非目标

**目标：** 入口非短路聚合；`development` / `environment` / `delivery` 分类；CLI JSON 带 `gaps`；有研发缺口不建 run。

**非目标：** 不另造检查器；不做 clean commit / change archived 硬门；不扩大 Finish 读 Change/Verification store。

## 受影响用户或角色

执行「收尾」的 Agent 与依赖 `task finish run --json` 的自动化。

## 核心流程

用户要求收尾 → `buildr task finish run` → 入口聚合观察 → 无缺口则建 run 跑五阶段；有缺口则 `task_finish.entry_gaps` 分类返回。

## 关键变化

- 入口失败码统一为 `task_finish.entry_gaps`，明细在 `details.gaps`
- Skill 消费聚合结果，不再链式只停第一项

## 影响 / 风险 / 兼容性

依赖「第一失败即停」的脚本需改读 `gaps`（BREAKING）。各 finding 保留原 code。

## 验收摘要

多模块缺口一次返回且不建 run；仅交付缺口不误标研发；既有 Finish 成功路径与单缺口行为不回归。

## 技术 artifacts 入口

- proposal/design/tasks：本 Change 目录
- delta specs：`task-finish-execution`、`public-json-contracts`、`agent-task-workflows`
