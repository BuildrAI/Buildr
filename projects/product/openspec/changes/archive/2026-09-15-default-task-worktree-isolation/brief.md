# 持久文件改动默认隔离

## 摘要与背景

所有受版本管理的持久文件改动默认在当前任务的独立工作树（Worktree）中执行，只有用户明确要求在主开发分支修改时例外。当前可选隔离策略使多个目标可能共用未提交文件，影响并发工作与集成。

## 角色与流程

用户确认目标和主开发分支例外；任务分流技能（task-triage）在首次写入前选择位置；工作树技能（task-worktree）创建、检查和安全清理。已有同任务位置复用；只读检查和合法任务记录可独立进行。新目录从已确认提交创建，不包含主目录未提交内容。

## 目标、边界与风险

覆盖代码、文档、配置、技能（Skill）及 OpenSpec 规划材料。保留现有命令、契约（Contract）、依赖准备和资源职责，不新增全局许可或自动合并。增加目录成本，通过复用控制；隔离降低共享目录干扰，不消除合并冲突。

## 当前知识影响

- 更新 `knowledge/docs/overview.md`、`knowledge/docs/guides/usage.md`、`knowledge/docs/flows/openspec-change-lifecycle.md` 和 `knowledge/docs/glossary.md` 的位置选择说明。
- 代码地图（Code Map）路径、模块职责及技术图（Technical Diagram）结构不变；项目声明流程的“直接工作”指直接调用工具，不表示主开发分支写入，无需重绘。
- 沿用现有术语，无新术语定义或新图建设。

## 验收与材料

验证默认创建、同任务复用、明确主分支例外、纯文档修改、主目录存在其他改动、隔离不可用时局部停止六类场景。实现依据见 [提案](proposal.md)、[设计](design.md)、[规范](specs/agent-task-workflows/spec.md) 与 [执行清单](tasks.md)。静态与回归检查不冒充所有智能体（Agent）的实际遵循保证。
