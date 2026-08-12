# 收窄 Task Finish 自举 Workspace 收敛

## 一句话摘要

通用 Task Finish 只在 Workspace 根 runtime source 变化时 render；Buildr package sync 改由当前自举 Workspace 安装的 Component、Skill Contribution与专属Skill完成。

## 背景与问题

现有实现为单一Buildr自举需求建立Project `task-finish.yml`、Service binding和`sync-workspace`通用模式，使普通用户Workspace也承担不需要的声明、匹配、Git convergence与恢复语义。用户Workspace开发Rule或Skill时只需要把已经交付的canonical source投射到Agent runtime。

## 目标与非目标

目标是删除通用sync授权模型，保留Task Finish内确定性的render/Doctor，并把自举sync作为当前Workspace可组合的工作方法。非目标是建设通用hook、进程框架、capability contract、数据库或新的Task阶段。

## 受影响用户或角色

- 普通Workspace中的Agent：Task Finish更简单，只在根runtime source变化时render。
- Buildr维护者：package payload变化后由自举Workspace专属Skill完成sync与必要Git收敛。

## 核心流程

Formal Task Finish继续完成carrier交付、可选runtime render、Doctor与Environment cleanup。成功后，有效`task-finish`中的Workspace Contribution调用自举Skill；Skill读取Formal Result的Task Contribution，命中固定package inputs时用retained Product CLI执行sync、受管delta commit/push与Doctor，未命中返回`not-applicable`。

## 关键变化

- 删除Project activation声明及`sync-workspace`产品分支。
- Task Finish planner只产生`none | render-runtime`。
- 通用Task Finish Skill增加`post-finish` contribution slot。
- 当前自举Workspace新增`buildr-self-bootstrap` Component、sync Skill与Contribution。

## 影响、风险与兼容性

Project `task-finish.yml`停止生效并删除，属于破坏性契约收窄。Formal Finish与自举convergence成为两个连续但独立的结果；自举失败不能撤销主任务交付，但必须阻止Agent报告完整收尾成功。既有Component/Contribution引擎、Task Result authority和用户Workspace默认资产保持兼容。

## 验收摘要

- 普通Workspace只有根runtime source变化会render，永不由Formal Finish执行sync。
- 自举Component仅当前Workspace安装，命中固定package inputs时执行retained sync。
- 未知Git delta、sync/push或Doctor失败均准确停止并保留现场。
- SQLite、Task Domain、Candidate、Review和Verification语义不变。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [agent-task-workflows delta](specs/agent-task-workflows/spec.md)
- [buildr-package-assets delta](specs/buildr-package-assets/spec.md)
- [tasks.md](tasks.md)
