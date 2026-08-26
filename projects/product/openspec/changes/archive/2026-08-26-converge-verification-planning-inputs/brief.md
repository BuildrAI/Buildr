# 收敛验证计划输入与准备闭包

一句话摘要：让所有新版Buildr用户Workspace在正式验证前得到统一changed path与完整Preparation preview，减少正常流程中的无效Plan和首次失败重试，同时保留Agent语义判断。

## 背景与问题

同一文件目前可能因Workspace/Project相对根不同得到不同owner结论；正式Task又要到`verification run`才发现辅助准备缺口，形成一次可避免的blocked/retry。跨多个lifecycle owner的提案也容易只覆盖局部能力。

## 目标与非目标

- 目标：canonical Project-relative path、Plan-only完整准备预览、一次Environment prepare、条件化跨owner Planning Review。
- 非目标：不自动安装、不扩大Task scope、不建立authority map平台、不改变Task Review Result、不削弱run门禁。

## 受影响角色与流程

- Agent：先用Plan预览准备要求，再交给Environment执行一次准备，最后启动formal run。
- 用户Workspace：升级Buildr并sync后获得通用CLI和managed Skill行为，不自动修改现有Task或声明。
- Project维护者：继续只维护v3 verification/preparation declarations，Legacy v2保持有限兼容。

## 关键变化

- 两种相对路径表达收敛为同一Plan identity。
- formal Plan result同时携带raw Plan和零副作用Preparation preview。
- closed Plan Request冻结全部selected capability requirements，而非missing subset。
- Planning Review只在真实跨owner时记录owner、不变量与未覆盖边界。

## 风险、兼容性与验收

- raw Plan v1与无Task plan-only保持兼容；formal envelope由同版run直接消费。
- preview不构成execution授权；run仍重验declaration、Environment与closure drift。
- 验收要求两种路径同identity、首次正确流程不再`preparation_blocked`、Product+Browser一次闭合、无新增硬门禁或持久化平台。

## 技术Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Project Test Capabilities Delta](specs/project-test-capabilities/spec.md)
- [Public JSON Contracts Delta](specs/public-json-contracts/spec.md)
- [Task Environment Preparation Plans Delta](specs/task-environment-preparation-plans/spec.md)
- [Task Review Results Delta](specs/task-review-results/spec.md)
- [Tasks](tasks.md)
