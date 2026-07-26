## 1. Task Finish 顺序与契约

- [x] 1.1 更新 Task Finish Skill source 与 capability contribution，把 delivery convergence、final assurance 和 closeout-only delivery 明确为三个有序阶段。
- [x] 1.2 将 current knowledge reconcile、managed integrity、canonical sync、candidate commit、目标分支 rebase、doctor/runtime sync 等会改变交付树的动作前移到最终保证之前。
- [x] 1.3 约束最终保证后的允许动作，并在目标分支或交付树发生实质变化时返回收敛阶段、废弃旧 evidence。

## 2. OpenSpec archive 预演

- [x] 2.1 在隔离副本中实现 archive compatibility rehearsal，覆盖 delta 合并、scenario identity、归档路径与无 delta specs Change，且不修改正式 checkout。
- [x] 2.2 将 rehearsal 接入 Task Finish 的 pre-sync/convergence 阶段，记录临时目录所有权、清理结果和可诊断 evidence。
- [x] 2.3 增加 archive rehearsal 的单元或集成测试，覆盖成功、scenario 重命名冲突、无 delta specs 与清理失败路径。

## 3. Candidate、目标分支竞态与验证 evidence

- [x] 3.1 调整 candidate commit、fetch/rebase、目标 ref 观察与最终保证的顺序，使最终 Candidate 绑定已完成常规收敛的 delivery tree。
- [x] 3.2 扩展 verification evidence，表达 `implementation-changed`、`target-race`、失败运行替代关系和结构化失效链。
- [x] 3.3 在收尾报告中汇总每次保证运行的结果、耗时、失效原因、替代关系和最终有效 evidence。
- [x] 3.4 增加目标分支稳定、最终保证后远端前进、rebase 冲突修复与重复 Candidate 的契约测试。

## 4. Archive-sensitive 覆盖与回归

- [x] 4.1 更新 Project verification 声明或选择逻辑，显式识别 active/archive 生命周期覆盖，避免测试只绑定 active 固定路径。
- [x] 4.2 增加同一 Change 在 active 与 archived 位置均可运行的测试，并覆盖归档后的唯一定位。
- [x] 4.3 增加 Task Finish 端到端回归，确认稳定目标分支的标准路径只执行一次最终保证，而真实失效仍会触发重跑。
- [x] 4.4 执行受影响验证并记录运行次数与耗时，确认顺序优化未削弱 pre-sync、post-sync、archive 和 Git 安全门禁。

## 5. 当前认知与运行时投射

- [x] 5.1 更新 `openspec/knowledge/flows/openspec-change-lifecycle.md`，记录 delivery convergence、final assurance、closeout-only delivery 与 archive rehearsal 的当前流程。
- [x] 5.2 更新 `openspec/knowledge/services/buildr.md`，记录 Task Finish 编排、verification evidence 和 archive-sensitive coverage 的 Service 责任。
- [x] 5.3 reconcile `.buildr/knowledge-impact.yml`，确认 Brief 与受影响当前知识和最终实现一致且无 unresolved items。
- [x] 5.4 通过当前 Product checkout 执行 Buildr sync/render，更新并核验 workspace 中受影响的 Skills、Components、Commands 或 Agent runtime 投射。

## 6. 最终验证与交付

- [x] 6.1 严格校验 OpenSpec Change、capability contracts、Component integrity、Task Finish 契约和知识维护 evidence。
- [x] 6.2 在最终交付树上执行 Project Candidate；该任务保持为最终实现任务，并只在 Candidate 成功且 tree identity 未变化后勾选。
