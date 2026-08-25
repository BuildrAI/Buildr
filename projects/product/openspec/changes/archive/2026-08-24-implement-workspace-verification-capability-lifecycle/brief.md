## 一句话摘要

把 Workspace 测试验证从 v2 的“若干可调用 capability”升级为单一 v3 能力族、可解释 Verification Request/Plan 和 matching Execution Record/Result，并在受控试点中一次性迁移删除 v2。

## 背景与问题

当前声明可以可靠引用已有命令或Agent操作，但主要依赖paths和自然语言conditions，不能一等说明本次验证目标、affected/full范围、Static/Unit/Component/Integration/System证据、依赖扩张和full理由。Buildr Product有私有registry/DAG可以解释选择，普通Workspace没有统一模型；若继续叠加兼容版本，长期会留下难以识别和删除的reader、文档与测试分支。

## 目标/非目标

目标是交付closed v3 Test Capability Family声明、Request/Plan、普通planner与高级provider contract；保持环境、授权、资源、Execution Record、Result和Task生命周期authority；完成受控live声明迁移并让active authority零v2支持。

非目标是不建立通用测试文件索引、通用DAG或跨Project依赖平台，不把Buildr Product私有registry推广给普通Workspace，不修改归档历史，也不从Product worktree越权修改其他Workspace。

## 受影响用户或角色

- 普通Workspace用户与Agent：用“目标、范围、证据”解释为什么选择这些验证，并在未知owner时获得明确gap/full理由。
- Project测试与声明维护者：只建设可发现的稳定测试入口和少量能力族，不维护具体测试副本。
- Buildr Product维护者：继续使用内部registry/DAG/Context Runtime，通过统一provider向公共Plan投射必要事实。
- 集鲜Pig、FreshX、Foundation维护者：在各自正式authority中一次性迁移live声明并验证真实选择场景。

## 核心流程

Project Testing建设最低充分且可发现的测试；Declaration Intake只读发现并经授权登记v3能力族；Task Verification冻结Request，按声明或provider形成Plan，Runner按Plan执行并写Execution Record，Application从matching记录提炼current Result。coverage gap回到测试建设/声明流程，风险接受和Task推进仍由原有authority处理。

## 关键变化

- v3声明增加evidence、usable targets、discovery、affected/full/provider入口。
- 新增closed Request/Plan和direct/dependency/full选择追踪。
- Product registry通过高级provider接入，内部DAG不进入公开schema。
- Doctor、Skills、package assets、CLI文档和测试只支持v3。
- Product live声明先迁移；集鲜三个Project由各自正式Workspace完成迁移，Parent验收汇总证据。

## 影响/风险/兼容性

这是破坏性配置迁移，不提供v2运行时兼容。主要风险是affected误收窄和跨Workspace激活顺序；通过显式affected入口、unknown owner失败关闭、full fallback、provider identity currentness以及“全部受控live迁移完成前不验收/不激活”控制。归档OpenSpec与Git历史可保留v2 provenance，但不参与runtime、package或当前文档入口。

## 验收摘要

- v3合法声明可诊断、计划和执行，v2在active runtime执行前明确invalid。
- Pig gap、FreshX affected/full、Foundation依赖扩张/unknown owner和Buildr普通/高级provider路径均可解释。
- 每个selected item保留触发、依赖/full reason、evidence与proves；matching Plan/Execution Record才能进入Result。
- 除archive provenance外，active runtime、canonical specs/docs、Skills、templates和tests没有v2支持。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/project-test-capabilities/spec.md`
- `specs/project-testing-guidance/spec.md`
- `specs/project-declaration-intake/spec.md`
- `specs/task-verification/spec.md`
- `specs/product-verification-quality/spec.md`
- `specs/buildr-package-assets/spec.md`
- `tasks.md`
