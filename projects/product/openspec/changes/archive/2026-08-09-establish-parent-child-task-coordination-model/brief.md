# 建立父子任务协调与独立交付模型

## 一句话摘要

Parent Task只协调最终结果和Contribution，Child Task以自己的窄Change独立交付，并用Contribution Handoff明确实际交付范围。

## 背景与问题

现有Parent既保存完整OpenSpec delta与`tasks.md`进度，Child又独立持有Change并归档，形成规范、进度和结果重复authority。Child提前交付其他范围后，Parent与后续Child还必须反复重写计划和Planning Review。

## 目标与非目标

目标是建立Parent Plan、Contribution/Contribution Handoff、显式reconciliation和统一派生read model，并保持Child完成不自动完成Parent。非目标包括workflow engine、DAG/scheduler、自动派工、状态双写、历史backfill、通用event/history/audit store或新的lifecycle projection。

## 受影响用户或角色

- Agent：创建/审查Parent Plan，从Contribution启动Child，消费handoff并显式reconcile。
- 维护者：在CLI和Local App中查看同一Parent/Child协调事实，并显式执行最终集成验收。

## 核心流程

1. 创建active Parent Task并记录Parent Plan；Parent可以没有覆盖全部Child的Change。
2. 从一个或多个Contribution创建绑定Parent的Child Task，在最新`dev`上创建自己的窄Change。
3. Child独立完成Development、Review、Verification、Change archive与Finish，handoff保存planned/delivered/extra/residual/superseded事实。
4. Parent Coordination Application动态组合Task状态和saved专业事实；若范围跨Contribution则显式reconcile Parent Plan。
5. 所有Contribution得到可证明处置后，Parent仍需显式整体集成验收和完成操作。

## 关键变化

- Task Development Receipt升级并复用现有SQLite current row；不新增表。
- Planning Review只绑定Parent Plan内容identity，不受普通Child状态影响。
- CLI、Local App与Agent使用同一Application，GET不扫描文件系统。
- 历史Task保持legacy/absent模式，不自动采用或迁移。

## 影响、风险与兼容性

主要风险是Receipt major兼容、并发reconciliation和缺失handoff的错误推断。通过v2 absent-compatible reader、expected identity、immutable handoff和`unproven`状态控制。没有SQLite schema migration，也没有单Task转换逻辑。

## 验收摘要

验收覆盖Parent无完整delta、Plan五类内容、Child独立Change、状态/Plan identity/Review独立、完整Contribution Handoff、partial/full supersede、显式最终验收、CLI/App/Agent parity、历史共存、fresh/upgrade和禁止重复authority。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/parent-child-task-coordination/spec.md`
- `tasks.md`
