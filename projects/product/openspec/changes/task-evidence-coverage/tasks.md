# 实施清单

## 1. 指引文本（技能与 OpenSpec 增强片段）

- [x] 1.1 `resources/workspace/skills/buildr/task-manager/SKILL.md`：在创建/修订部分明确 `intent` 为任务级需求说明的写法（问题、目标、范围边界、必要验收要点），并说明与变更 `brief.md` 的分工。验证：文本落位且与 delta 规范一致。
- [x] 1.2 `resources/workspace/skills/buildr/task-review/SKILL.md`：增加"何时审查"段落——`change-flow` 任务默认在规划材料齐备后做方案审查、实现与验证对象稳定后做实现审查；其他路径按需触发并说明理由；审查保持可选证据。验证：段落存在且不引入门禁表述。
- [x] 1.3 `resources/workspace/skills/buildr/task-triage/SKILL.md`：在 `change-flow` 交接处标注默认两次审查预期，非变更路径不列默认。验证：与 task-review 指引一致。
- [x] 1.4 `resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md`：加入规划完成前的 `brief.md` 存在性自查，并把方案审查从"按风险选择"调整为"change-flow 默认执行"。验证：片段文本更新且与既有"收敛 Brief"要求衔接。
- [x] 1.5 `resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md`：实现完成、预归档检查前默认执行实现审查（以任务需求与已审方案为基线）。验证：片段文本更新。
- [x] 1.6 `resources/workspace/skills/buildr/task-finish/SKILL.md`：集中核对增加"已发生但未登记的验证/审查证据先登记再完成"；成果确需人验收时登记 acceptance 事项（不新增默认确认环节）。验证：清单行落位且不形成门禁语义。

## 2. Buildr Web 前端

- [x] 2.1 `services/buildr-web`：任务需求节点目录首项固定为任务目标（`kind:'intent'`），变更 `brief.md` 作为补充需求文档同层列出；默认选中任务目标；无补充文档时不再只显示空态。验证：`taskWorkContent` 相关单元测试通过、浏览器冒烟中需求节点断言更新后通过。
- [x] 2.2 更新 `services/buildr/test/browser-smoke/buildr-web-browser.test.ts` 中依赖"需求节点默认展示 brief"的断言（先选 Brief 项再断言）。验证：相关用例通过。

## 3. 当前认知

- [x] 3.1 `knowledge/docs/architecture/task-system.md`：更新"从目标形成可继续的工作"与"人怎样看成果、作决定"中对需求节点、审查默认触发和用户确认节点（acceptance 事项填充）的表述。验证：文档与最终实现一致。
- [x] 3.2 `knowledge/code-map/task-system.md`：核对 `TaskNodeContent.tsx` 职责描述，补充需求节点以任务目标为默认正文的事实（若有对应条目）。验证：地图描述与实现一致。

## 4. 直接验证

- [x] 4.1 `openspec validate task-evidence-coverage --strict` 通过。
- [x] 4.2 `buildr openspec convergence preflight` 通过。
- [x] 4.3 前端受影响测试（`buildr-web` 的 `taskWorkContent` 单测与需求节点相关浏览器用例）按项目入口执行并通过。
