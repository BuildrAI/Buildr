# 重构任务验证与项目测试地图

任务验证不再生成计划或执行测试。项目通过`verification.yml`声明稳定测试体系和发现方式，智能体（Agent）结合Task目标与当前改动选择并直接调用Maven、npm、Playwright、Browser、HTTP或项目runner；开发完成后，Buildr只保存一份有意义的任务验证报告。

本次破坏性删除旧`verification plan|run|cleanup`、`task verification reconcile`、Candidate绑定、Development policy、任务验证专属Execution Record及其资源调度、恢复、unknown授权和GC。Task Development与其他专业模块不再把Task Verification作为门禁、Candidate或handoff依赖。

Project Verification Application只负责`inspect|validate|update`测试地图；Task Verification Application只负责`record|inspect`报告。现有current数据迁移为新报告结构，Buildr Web独立展示报告，项目自有复杂测试runner仍由项目自行维护。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [task-verification spec](specs/task-verification/spec.md)
- [project-test-capabilities spec](specs/project-test-capabilities/spec.md)
- [task-development spec](specs/task-development/spec.md)
- [task-execution-artifacts spec](specs/task-execution-artifacts/spec.md)
- [tasks.md](tasks.md)
