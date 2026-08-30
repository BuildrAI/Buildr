## MODIFIED Requirements

### Requirement: Preflight 必须一次聚合廉价门禁
本条仅约束显式采用旧收尾运行（Finish Run）的专用执行路径；默认技能收尾与直接交付后的自举 MUST NOT依赖该路径或补造其证据。

`preflight` MUST在任何delivery mutation前通过Task Development Application取得current handoff，并一次聚合Environment executable、handoff applicability、delivery target、retained root、carrier prerequisites与cleanup ownership findings。Finish MUST NOT在preflight解析Change/tasks/knowledge/OpenSpec、verification policy、Review或Verification stores；这些facts必须已由Development handoff闭合。Preflight有error时 MUST零delivery mutation。

创建新的Task Finish run之前，产品入口 MUST同样一次观察当前可解析的Environment、Development handoff与交付target/remote事实，不得在第一项失败处短路；观察 MUST复用各模块既有检查事实，不得另造检查器。入口缺口 MUST按模块分类为`development`、`environment`、`delivery`。只要存在任一入口缺口，产品 MUST NOT创建Finish run、MUST NOT open Finish execution record，也 MUST NOT开始五阶段。存在`development`缺口时，结果 MUST路由`task-development`；Finish MUST NOT把Change archive、Verification/Review正文或`clean commit`做成独立入口硬门禁。

#### Scenario: 候选同时存在多个廉价问题
- **WHEN** Development handoff stale、receipt-bound CLI不可执行且目标ref不可用
- **THEN** preflight MUST在同一结果中按check identity返回全部可同时观察的问题
- **AND** prepare、verify、deliver与cleanup MUST保持未执行

#### Scenario: Receipt 只证明路径身份
- **WHEN** Task Development Application报告handoff missing、blocked或stale
- **THEN** Finish MUST返回`nextWorkflow: task-development`
- **AND** MUST NOT从Task Record、Git、Change、Review或Verification自行重建handoff

#### Scenario: 创建 run 前同时存在多模块入口缺口
- **WHEN** 调用方执行`buildr task finish run --task <id>`，且当前可同时观察到Environment未ready与Development handoff缺失或stale
- **THEN** 产品 MUST在同一失败结果中同时返回`environment`与`development`分类缺口
- **AND** MUST NOT创建Finish run或execution record
- **AND** MUST将下一步路由为`task-development`

#### Scenario: 仅交付入口缺口
- **WHEN** Environment ready且Development handoff current，但delivery remote无法确定或target branch不可用
- **THEN** 产品 MUST只在`delivery`分类中返回缺口，并拒绝创建run
- **AND** MUST NOT把该失败表述为Development handoff缺陷

## ADDED Requirements

### Requirement: 五阶段执行器不得成为普通交付前提
本规范既有五阶段、候选、运行与交接要求 MUST仅适用于显式调用旧执行器。默认收尾 MUST不自动运行该执行器或创建其状态；旧结果可保留只读和显式恢复。

#### Scenario: 直接完成目标
- **WHEN** 用户已通过 Git 或其他适用工具完成目标
- **THEN** 系统 MUST允许独立保存任务结果并处理安全清理，不要求 `task finish reconcile`。
