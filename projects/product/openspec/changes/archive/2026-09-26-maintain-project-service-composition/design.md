## Context

现有 `projects/manifest.yml` 的 `serviceIds`、`services/manifest.yml` 的 `repositoryId`/`modulePath` 和 `repositories/manifest.yml` 已表达组成。`buildr assets inspect|associate` 直接读写本地文件，并沿用应用（Application）的版本校验与事务；组成图读取同一登记。

## Goals / Non-Goals

以一个简短技能（Skill）和一处日常开发指引覆盖首次梳理、增量维护与核对，不增加状态、字段、后台进程或保存抽象。范围见 `proposal.md`。

## Decisions

- 使用 `project-composition-maintenance` 独立描述入口；它维护登记事实，与 `current-knowledge-maintenance` 的知识解释职责分开。不增加能力协作约定（Capability Contract）或强制绑定，因为其他工作无需等待其固定结果才能安全执行。
- 采用已有本地资产命令维护清单（Manifest），而非直接重写文件：成本相同且复用陈旧写入保护。未来云端版（Cloud）再按实际产品入口调整保存方法，首版不预建适配层。
- 在 `task-triage` 提示开始判断与修改后复核；技能（Skill）本身允许通过用户意图直接发现。只处理受影响业务；已授权开发中必要的组成校准纳入同次范围，查看请求仍只读。
- 以业务职责判断组成，代码扫描提供证据。保留已确认但尚未编码的组成，未决定方案只在回答中说明，不增加计划状态。
- 新身份优先使用已有登记与创建动作；仅调整现有组成时只写 `serviceIds`。移除关联不删除全局登记及代码。

## Risks / Trade-offs

- 自动发现依赖智能体（Agent）遵循方法 → 在开发入口明确增量复核；不承诺无人工作时自动更新。
- 错把未扫描到当作不需要 → 结合业务决定判断，仅有确定停用依据才解除关联。
- 并发写入覆盖 → 使用当前 `revision` 保存，冲突后重读并合并本次增量。

## Migration Plan

沿既有随包资源安装、更新及运行时投射交付；无数据迁移。旧清单（Manifest）继续沿已有显式迁移入口处理，技能（Skill）不重建身份。回退技能（Skill）资源不撤销已成立的业务关联。
