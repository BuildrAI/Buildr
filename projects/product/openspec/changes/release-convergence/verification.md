# 发布收敛重构：本机验收与采用边界

2026-10-16。实现位于独立工作树 `.worktrees/release-convergence`，基于 `cb819123e27d733f2dcf2d0b7d2dff3b0e563b69`。本轮没有提交、推送、合入或派发远端工作流（Workflow），没有改变原候选版或公开版本。任务为 `release-convergence`。

## 四个问题对应的实际变化

| 原问题 | 本轮实现 | 证明与限制 |
|---|---|---|
| 工具未验收到就绪环节 | 默认 `prepare` 的原包补验、采用与就绪组合回归；派发拒绝、响应丢失、查询失败分别恢复 | 使用真实临时 Git 仓库、真实压缩包与命令入口；外部平台接口采用受控替身，不宣称真实公开成功 |
| 无关变化使大量结果失效 | 12 个已核验运行检查分离产品与配方输入；隔离 Git 案例不再绑定共享引用；只读计划解释每项失效及成本 | 真实文件、子脚本、依赖及引用反例通过；动态读取、通用集成组及未核验输入仍保守，不能承诺所有局部修改只重跑一个测试 |
| 工具源码与产包身份耦合 | 不变构建输入绑定原产包来源与独立验证来源；正式补验保留原包和逐项证明；主包公开消费采用已验证工具源码 | 原工作流定义也须不变；前端与 DSH 自身测试和工具仍按保守构建输入处理。未变化的插件、SDK 与精确对端可保留完整证明 |
| 缺少收敛边界 | 失败返回阶段、保留事实和最小恢复动作；未知请求先回读；复用不申请执行资源；长检查使用已有独占调度（Exclusive Scheduling） | 本轮没有第二次全量核心回归，失败后只诊断或补验相关步骤。没有扩大时限、删除断言或取消必要平台 |

## 实际执行结果

| 检查 | 本次事实 |
|---|---|
| 发布基础设施与相关契约（Contract） | 初轮 269 项中 267 项通过；两项旧工作流断言在变更后定向更新并通过后续契约检查 |
| 核心回归 | 一轮 46 个步骤，11 分 37 秒；41 个通过，5 个失败，原记录保留 |
| 环境准备 | 独立工作树最初缺网页构建输入；移除本任务的共享依赖符号链接，再通过 `candidate-environment.ts prepare --profile source-runtime` 完整准备，约 20 秒；未修改原工作树依赖 |
| 失败边界补验 | 对 `integration`、`integration-runtime`、`system-nested-git-isolation`、`system-buildr-web-http`、`system-app-process` 定向执行；5 个全部通过，9 分 57 秒 |
| 同输入恢复 | 上述 5 个步骤再次进入同一 `test:focus` 入口，5 个全部复用、实际测试执行为 0、无执行容量等待；整次身份核对与报告耗时 5.027 秒 |
| 最后相关回归 | 181 项中 180 项通过；新增默认入口案例的夹具（Fixture）误将嵌套工作树加入 Git，被输入保护拒绝；修正夹具的精确暂存路径后，默认入口与知识治理共 14 项全部通过 |
| 类型与生成物 | 最后一次完整 `typecheck` 通过，覆盖产品和测试 TypeScript 及生成物一致性 |
| 声明与文档 | 改动选择审计、必需证明归属及日常/发布边界审计通过；知识索引读取与关联检查通过；文档链接检查通过。文档检查不等于全部正文语义审查 |
| 规范 | `openspec validate release-convergence --strict` 通过；本变更未归档 |

核心回归的失败包括网页构建输入缺失、嵌套 Git 子进程超时、通用集成组总时限，以及运行时组中的短时限和环境失败。补齐输入后相关案例通过；嵌套 Git 单独诊断也通过。嵌套 Git 与通用集成组增加外层互斥后，组合复验保留全部案例及原时限并通过。这些观察支持本次修正，不能据此推断所有历史超时都有同一原因。

新增关键反例覆盖：真实包被改写、产包来源不符、构建输入变化、错误平台、原运行不可信、重复结果、缺少必要检查、浏览器阶段缺失、空宿主成功包装、矛盾子进程退出状态、复用输入漂移、缓存（Cache）撤销、未知派发不重复，以及发布执行工具来源不符。

## 仍需完成的真实平台采用与风险

- 新工作流（Workflow）尚未在 GitHub Actions 上执行。采用后需要一次受控的无公开副作用验收，核对正常候选、原包补验、Windows/macOS/Linux、产物传递及受保护发布准备；旧工作流没有新入口，不能直接套用新参数。
- 生产 npm 写入、真实平台审批与身份凭证未执行；本地替身（Test Double）成功不替代它们。本轮没有继续原候选发布。
- 通用集成组在补验中耗时 **294.136 秒，距离 300 秒上限只有约 6 秒**。独占执行已避免本轮超时，但长尾仍然明显；最慢的 `inline-workspace-core-rules.test.ts` 文件报告约 167 秒。后续应针对这份测试的重复初始化与命令开销继续优化，不能宣称该组稳定性已由一次通过充分证明。
- 通用集成组及动态读取检查仍有较宽输入范围；前端与 DSH 工具变更也尚未细分为逐检查输入。已有逐项原因可以显示这些保守失效，后续收窄须补读取范围反例。
- 本轮实测的 5 秒是同输入复用成本，不是首次发布耗时。尚无新流程完整远端发布的测量，不能承诺固定的正常发版总时长。

## 原始本机记录

记录位于本机临时目录，属于本轮执行证据，不是发布产物；下面路径便于当前现场接续。

- 初轮核心：`/tmp/buildr-release-convergence-core.log`；结构化汇总位于 `/var/folders/13/fhx82yyx6gz0h2vpmn8fh4480000gn/T/buildr-core-evidence-P0Ol88/timing.json`。
- 定向恢复：`/tmp/buildr-release-convergence-recovery.json`、`/tmp/buildr-release-convergence-recovery.log`。
- 同输入复用：`/tmp/buildr-release-convergence-all-reused.json`、`/tmp/buildr-release-convergence-all-reused.log`；只读计划 `/tmp/buildr-release-convergence-reuse-plan.json`。
- 相关回归与修正后入口：`/tmp/buildr-release-convergence-final-tests.log`、`/tmp/buildr-release-convergence-final-entry.log`。
- 类型、准备与选择审计：`/tmp/buildr-release-convergence-final-types.log`、`/tmp/buildr-release-convergence-preparation.json`、`/tmp/buildr-release-convergence-audit.json`。
