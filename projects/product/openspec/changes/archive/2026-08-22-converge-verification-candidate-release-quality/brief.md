## 一句话摘要

把 Buildr 治理测试从“Skill 是否写了固定句子”收敛为“多条合法路径是否产生相同、可核验且彼此隔离的结果”，同时保持完整 Candidate 与正式 Release 的不可逆门禁，只消除重复主证据和无价值成本。

## 背景与问题

前序治理 Child 已经完成门禁分类、Task/Environment 准入、Development evidence、Workspace/Doctor 局部诊断和协调/UI 收敛。当前仍有部分低成本 contract tests 直接读取 Skill Markdown并断言固定措辞、篇幅或段落顺序；这类测试容易在文档重写时误报，也不能证明 Application、CLI、HTTP、CI 与Reconciliation的真实结果。

Candidate/Release 编排已经具备唯一tarball、去重DAG、并行shard、aggregate gate和公开readback。本次只完成质量收口，不重建编排器。

## 目标/非目标

目标是让测试优先证明authority、authorization、identity、effects、多路径一致性和failure isolation；证明开发反馈、完整Candidate与正式Release各自只承担一次必要primary evidence。

非目标包括legacy Parent correction、新测试平台、第二verification registry、削减required release gates、复用旧identity evidence或改变发布权限。

## 受影响用户或角色

- Agent与维护者：Skill文字可在不改变契约时自由改进，测试失败更接近真实行为缺陷。
- Release维护者：仍只批准一次正式protected transaction，Candidate与publish证据边界更清楚。
- Buildr用户：不新增流程选择，也不承担内部验证编排诊断。

## 核心流程

开发阶段使用focused/changed/affected取得最低充分反馈；内容与planning bytes冻结后形成一次完整Product Candidate，所有artifact consumer复用同一tarball；正式Release只验证并发布matching artifact，完成OIDC、tag、npm integrity、dist-tag、GitHub Release和安装后readback。

## 关键变化

- 删除或改写固定Skill措辞、篇幅和流程顺序断言。
- 增加跨模块治理不变量与unrelated failure isolation测试。
- 结构化核对changed/focus/Candidate计划、Candidate CI shard和publish artifact依赖。
- 保留全部真实authorization、identity、共享历史、cleanup ownership与公开发布门禁。

## 影响/风险/兼容性

不改变公开CLI/API、Task schema、npm package内容或发布控制面。主要风险是删除prose断言后遗漏路由回归；通过manifest/binding/contract identity与最低充分行为owner共同覆盖。性能证据不成为正确性门禁。

## 验收摘要

- Skill非语义重写不再因旧句子或章节位置导致行为测试失败。
- 公共结果违反authority、identity、effects或failure isolation时，最低充分测试会失败。
- changed/focus不冒充完整Candidate；完整Candidate每step最多一次且只生成一个tarball。
- publish不重跑完整Candidate，仍完成所有不可逆发布authority与readback。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
