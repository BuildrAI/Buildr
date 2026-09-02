# Buildr测试框架与Task Verification实践

本文说明Buildr当前如何开发、分层和选择测试，以及Task Verification怎样使用Project测试地图。机器可执行的当前事实以[verification.yml](../verification.yml)和唯一[verification registry](../services/buildr/test/verification/registry.mjs)为准；本文不复制step清单或耗时快照。

## 测试模型

每个测试能力回答三个正交问题：

| 维度 | 典型值 | 回答的问题 |
|---|---|---|
| 主要意图 | Development、Acceptance、Static Conformance、Delivery / Release | 为什么需要证据 |
| 执行边界 | Static、Unit、Component、Integration、System | 穿过什么技术边界 |
| 选择范围 | affected、full | 本次证明多少 |

Product Candidate是发布体系的完整候选验证对象，不是任务开发状态。Task Verification只保存当前任务实际运行的检查、范围、结果和缺口。

## 当前入口

- `npm run typecheck`：strict TypeScript、Test Context投射和no-emit检查。
- `npm run test:unit`、`test:component`、`test:contract`、`test:integration`、`test:system`：直接测试层。
- `npm run test:changed`：按当前改动选择affected owner；验证架构自身变化可升级为full。
- `npm run test:focus -- <selector>`：明确诊断一个或多个owner。
- `npm run test:browser:changed`或具体Browser selector：真实Buildr Web浏览器验证。
- `npm run test:candidate`：完整Product Candidate；冻结唯一tarball并运行平台、安装与兼容性证据。

具体命令、依赖、selection、资源需求和预算只在registry维护，文档不复制动态inventory。

## Owner与边界

- Unit保持纯逻辑；Component只组装有界Application；Integration穿过真实filesystem、Git、SQLite或进程边界；System覆盖完整用户入口。
- 每个测试文件只有一个primary owner。general suite排除已经由领域slice持有的文件。
- Task Record、Task Overview、Review、Verification、Environment、Parent Coordination与Retrospective各自使用独立owner。已删除的任务研发、任务规划身份和旧收尾Application没有测试slice、System owner或Candidate shard。
- self-bootstrap仍是独立真实生命周期owner；Product/Release Candidate、tarball、npm、Launcher和发布事务保持自己的Release owner。
- Browser只在用户可见路径需要时运行，并使用本机Chrome/Chromium与隔离Workspace。

## 并发与资源

外层scheduler按execution profile发放global、class和numeric resource grant；inner runner只能消费实际grant。`workspace-saturating`、`task-lifecycle-heavy`和`app-runtime`是压力资源，不是共享状态锁。每个case仍使用独立临时根或可验证sandbox；污染、超时和cleanup失败必须显式报告。

公共Node Test Context Runtime只复用与待证行为无关、可检查且可reset的Application或不可变seed。初始化、migration、自举、Candidate、tarball与Launcher等以生命周期本身为主证据的owner继续完整执行。

## Task Verification使用方式

1. Agent读取Task目标、实际改动、Project `verification.yml`和真实测试入口。
2. 开发中直接运行最低充分反馈，不写正式报告。
3. 开发完成后选择覆盖实际影响的检查；失败先修复或如实保留缺口。
4. 通过`task verification record`保存一份current报告；Application不生成计划、不代跑测试、不决定Task完成。
5. 内容或测试地图变化后，Agent重新判断旧报告是否适用，只重跑实际受影响部分。

某项测试或专业结果缺失，只影响依赖它的判断或动作；不得扩大为所有工作的统一门禁。

## 历史性能证据

旧owner、旧step数量和历史耗时只保存在[日常验证证据与选择审计](verification-evidence-audit.md)等明确标记为历史的文档中，用于解释过去优化，不作为当前registry或预算事实。
