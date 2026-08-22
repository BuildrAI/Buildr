## 1. 契约与边界

- [x] 1.1 审计当前dev发布、验证、Task/Finish/self-bootstrap与服务架构事实，形成release集合身份链和owner/consumer矩阵
- [x] 1.2 为release集合、发布治理、Product Candidate、Agent工作流、Finish与self-bootstrap建立窄delta specs并通过OpenSpec strict validation

## 2. 当前认知与维护入口

- [x] 2.1 更新Brief、发布流程、Buildr Service current knowledge与canonical glossary，并完成knowledge impact reconcile
- [x] 2.2 更新workspace source `buildr-release` Skill，按release集合重写检查、准备、发布、恢复与报告边界
- [x] 2.3 更新release checklist，使维护步骤和术语与canonical specs一致且明确P1/P2/P3未实现边界

## 3. 契约保护与实现审查

- [x] 3.1 增加最小contract tests，保护release身份链、模块owner矩阵、Skill source authority和旧dev→main前提退出
- [x] 3.2 运行受影响Static/contract检查并修复契约、文档、Skill或current knowledge漂移
- [x] 3.3 审查最终diff与术语，确认没有提前实现selection/Candidate/evidence/readiness/convergence，也没有第二store或跨模块writer
