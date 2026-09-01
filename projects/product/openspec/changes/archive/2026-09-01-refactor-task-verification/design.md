## Context

当前Task Verification同时承担项目声明解析、测试选择、Plan、执行、资源协调、Execution Record reconciliation、Candidate gate和最终Result，Task Development又把这些事实纳入policy、Candidate、decision和handoff。项目已有Maven、npm、Playwright、HTTP、CI或自有runner时，这套通用平台重复实现测试系统，并把局部测试问题放大为Task生命周期问题。

目标设计遵守智能体优先原则：项目只长期声明稳定测试地图；Skill指导Agent理解任务与项目；Agent直接调用现有工具；Application只维护项目地图和开发完成后的任务验证报告。

## Goals / Non-Goals

**Goals:**

- 将`verification.yml`收敛为少量稳定测试体系及发现方式。
- 让Agent根据Task、当前改动和项目事实选择并直接执行测试。
- 让Task Verification只保存、读取一份有意义的完成报告并判断current/stale。
- 完全删除Task Development、Candidate和风险决定对Task Verification的流程依赖，并整体退役没有生产者的Task Execution Record。
- 将已有current数据迁移为新报告结构，删除旧运行时执行架构。

**Non-Goals:**

- 不为Java、前端或其他技术栈创建测试框架。
- 不把Buildr Product自身的测试registry、DAG和资源控制推广为通用产品能力。
- 不保存开发过程中每次测试运行。
- 不通过Task Verification判断Task能否完成或接受风险。
- 不保留Task Execution Record命令、HTTP、Web、恢复、cleanup或GC兼容入口。

## Decisions

### 1. Project Verification与Task Verification分离

Project Verification Application维护`buildr.project-verification/v4`测试地图，提供`inspect|validate|update`。候选由Agent根据代码、测试目录、构建脚本、CI和说明形成；Application只做closed schema、scope、路径、命令和CAS校验。

Task Verification Application维护`buildr.task-verification-report/v1`，提供`record|inspect`。报告绑定Task、Task scope、内容版本、当前测试地图、实际checks、gaps、结论和完成时间。

Application不替Agent选择测试，但必须校验Agent提交的check确实属于Task scope；Project测试地图可用时，还必须确认testing family及可选Service匹配。地图缺失或损坏只影响“是否已声明”这一局部事实：真实check继续保存为`map-unavailable`并追加gap，不因声明缺陷丢失已经成立的测试结果。

三态结论只表达报告自身事实：`passed`至少有一项实际check且全部通过；`not-passed`至少有一项failed check；`incomplete`没有failed check但存在gap。调用方未提供current内容identity时，读取端只返回内容适用性unknown，不新增内容版本服务。

替代方案是由Task Verification自动生成Plan；该方案被拒绝，因为测试选择需要Agent结合任务语义和当前现场判断，确定性Application无法可靠替代。

### 2. Agent直接执行项目测试

Skill指导Agent在开发中选择快速反馈，在开发完成后扩大到任务相关功能测试、相关服务低成本完整回归和适用环境冒烟。Agent直接使用Maven、Gradle、npm、Playwright、Browser、HTTP或项目runner。

替代方案是Buildr统一执行；该方案被拒绝，因为会复制Spring、Testcontainers、Redis、前端Browser和环境测试的项目架构，并引入不必要的资源与失败状态。

### 3. Task Verification与Task Development完全独立

Task Development不再声明、读取或依赖Task Verification，不再维护verification policy、verification gate、Formal Verification Readiness、Candidate验证绑定或风险决定。Task Verification报告也不引用Candidate、generation、handoff或Development Receipt。

需要在Task详情或终态页面同时展示两者时，由read model分别读取独立事实，不形成写入或推进依赖。

### 4. 整体删除Task Execution Record

当前生产代码没有Task Finish调用`open`、`seal`或`progress`；只剩Execution Record自身Application、手工恢复CLI和测试在制造记录。保留该模块会为不存在的生产者继续维护metadata、body store、quota、redaction、retention、recovery、GC、HTTP与Web。

因此整体删除Task Execution Record。SQLite migration删除表和索引；受明确owner路径约束的本机正文由迁移后的清理逻辑移除。Task Finish只保留自身current/terminal Result、failure、cleanup与必要恢复事实，不创建通用执行记录。

项目自身需要执行日志、DAG或资源协调时，由项目runner负责；Task验证报告只保存有意义的摘要，不复制raw output。

### 5. 迁移为单一新结构

SQLite migration把旧current Result能确定转换的Task、target、declaration、capability fact、gap和结论投影到v1报告；无法表达的新字段不保留为第二authority。后续migration删除整个`task_execution_records`表。

## Risks / Trade-offs

- [旧Development Receipt仍含verification字段] → 只作为历史读取数据；新Domain、Application、Skill和consumer不再生成或依赖这些字段，后续Task Development自身重构可迁移其Receipt schema。
- [旧执行日志不再有产品恢复入口] → 当前报告与Task Finish Result保存必要摘要；项目runner负责自己的详细日志。以后出现真实长流程恢复需求时，由具体owner基于当时需求设计，不预留通用记录平台。
- [Agent报告可能过于笼统] → closed schema要求实际checks或gaps，并保存选择范围、目标、结果和结论；`passed`不能只靠gap，三态结论矛盾时拒绝写入。
- [测试地图可能失真] → update使用expected identity，Doctor和validate只读检查；Agent必须依据当前项目事实形成候选。Task报告对可用地图做确定性绑定；地图缺失或损坏时标记`map-unavailable`与gap，不否定真实check。

## Migration Plan

1. 建立v4测试地图与Project Verification接口。
2. 建立v1任务验证报告Domain、Application、CLI、HTTP和Web投影。
3. 删除全局Plan/Run/cleanup/reconcile与执行实现。
4. 删除Task Development及其他消费者依赖。
5. 迁移Task Verification current数据并删除整个Task Execution Record表及产品表面。
6. 更新Skill、契约、项目声明、当前知识与测试。
7. 运行strict、静态、单元、组件、契约、完整集成、相关System和Browser验证。

回滚只允许回滚整个版本与SQLite migration；不得在新代码上恢复旧命令或双写两套current结构。

## Open Questions

无。产品边界已由用户确认。
