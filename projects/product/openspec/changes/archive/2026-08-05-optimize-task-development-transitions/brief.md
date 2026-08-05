# 优化 Task Development transition 执行成本

## 一句话摘要

让 Task Development 返回真实可归因的进程内阶段计时，并在一次 action 内消除重复 canonical Workspace 与 package migration 观察。

## 背景与问题

一次历史复盘把约 7.36 秒归因于 Task Development 冷启动，但该数据包含外层工具调度并引用了不存在的 `dist` driver。当前 `src` driver实测module load约60–70ms、runtime composition约2–3ms、完整`inspect`约0.7–0.8s；真实成本主要来自同一action内重复Task Record/SQLite访问和Git checkout canonical确认。

## 目标与非目标

目标是提供opt-in profile evidence、减少已证明的重复观察，并保持现有Application authority、Receipt与transaction边界。非目标是不合并多个transition、不增加公共CLI，也不引入daemon、跨进程缓存、第二writer或新状态平台。

## 受影响用户或角色

主要影响使用Buildr内置Task Skills推进正式任务的Agent，以及通过Local App读取Task Development current状态的维护者；默认workflow和JSON结果保持兼容。

## 核心流程

Agent仍逐次调用Task Development action。每次action建立短生命周期operation scope，重新确认current facts；scope内重复Structured Store访问复用canonical root判定，action结束即释放。需要诊断时显式启用`--profile`取得阶段计时。

## 关键变化

- driver新增opt-in profile wrapper，默认result shape不变。
- Workspace SQLite新增同步operation scope，并复用本次action内由Task Record/Environment owner Application形成的相同输入read model。
- 默认package migrations解析结果按进程复用；数据库connection与专业read model不复用。
- 测试使用结构性调用上限和语义等价作为稳定门禁，耗时样本用于趋势证据。

## 影响、风险与兼容性

主要风险是缓存跨action泄漏，因此scope必须在成功或异常后释放，并拒绝异步operation。默认调用兼容；无schema migration或数据迁移。

## 验收摘要

profile阶段齐全且不持久化；同一action对同一root最多一次Git canonical observation；下一action重新观察；Task Development现有integration/system/contract tests保持通过；真实样本显示产品execution下降。

实现后对同一ready Task连续执行三次`inspect --profile`，总耗时分别为1568ms、1325ms和1339ms，其中composition仍约2–3ms，Application约1265–1473ms。相较优化前同路径约6636–9000ms，下降约76%–85%，已优于原定2–3秒目标且没有引入跨action缓存或常驻进程。直接相关测试22/22通过，changed verification的Unit、Integration、Task Development Integration、Contract、System、OpenSpec与Docs owners全部通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-development/spec.md`
- `tasks.md`
