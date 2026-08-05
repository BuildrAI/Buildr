# Task Finish retained activation 选择与收敛

## 一句话摘要

让 Task Finish 只在 retained Project/Service 明确授权且任务贡献命中声明输入时执行自举 `sync`，普通 Workspace Rule/Skill 交付只 `render` Agent runtime。

## 背景与问题

当前 Task Finish 把 runtime 影响压缩为 `requiresRuntimeSync` 布尔值，并在 deliver 中固定执行 `buildr sync`。这适合 Buildr Product 自举，却会让用户在自己的 Workspace 开发 Skill 后更新 Builtin、Component 与其他源资产；同时 sync 产生的新受管 Git delta 没有独立的提交、推送和最终远端收敛证据。

## 目标与非目标

目标是形成冻结的 `none | render-runtime | sync-workspace` activation plan，以 retained binding 授予 sync 资格、以 Task Contribution 精确触发，并分别约束 render 与 sync 的 Git effect。非目标是建立任意脚本、部署/发布、多仓交付、第二 Candidate/Verification authority或通用 adapter registry。

## 受影响用户或角色

- 在普通 Buildr Workspace 开发 Rule、Skill 的用户与 Agent。
- 在 Buildr 自举 Workspace 开发并交付 Buildr Product 的维护者。
- 审计 Candidate、carrier、activation 与最终远端证据的 Task Finish consumer。

## 核心流程

Task Finish preflight校验retained Project/Service activation authority；prepare取得精确Task Contribution paths并把binding digest与plan冻结进current carrier；deliver先交付carrier，再按plan执行none、render或sync。render必须保持tracked tree不变；sync只接纳受管delta，并在需要时创建独立convergence commit、普通push与最终远端回读，之后才请求Environment cleanup。

## 关键变化

- Project `task-finish.yml` closed self-bootstrap binding。
- retained-only授权与 scope/path 双重触发。
- render tracked-delta 门禁和 sync managed-only ownership。
- `remoteAfterRef` 与 `finalRemoteRef` 分离，保留 carrier ancestry。
- exact resume 覆盖 convergence push/readback 暂态失败。

## 影响、风险与兼容性

变更保持 Task Finish 五阶段和 run/result v2 主体，但新增 activation plan/result 与自举 convergence evidence。主要风险是候选自授权、sync delta 混入用户 dirty、carrier 已交付后的部分失败；分别由 retained-only binding、前后 Git 快照/精确 ownership与持久 convergence ref/exact token控制。

## 验收摘要

- 普通代码选择 none，用户 Workspace Skill 选择 render 且零 sync。
- Buildr package 输入只有在 retained binding 匹配时选择 sync。
- render 产生 tracked delta、sync 混入未知路径或未声明 sync 时 fail closed。
- 受管 sync delta 使用独立 commit/push，最终 ref 可证明以 carrier 为祖先。
- Candidate generation、Formal Verification、Review、decision 与 Environment authority不变。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta specs](specs/)
