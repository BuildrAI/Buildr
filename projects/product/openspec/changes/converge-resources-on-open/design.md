# Design: 打开工作空间时自动收敛共享资源

## Context

`~/.buildr/resources` 是全机唯一共享资源集；每个空间的 `skills/manifest.yml` 通过 `resource:` 引用它。打开空间时 `prepareWorkspaceForOpen` 在 `adopted.ready` 为真时只跑 `refreshResourceProjection`（renderRuntime + adopt），不收敛清单；清单中已移除的资源使 `resolveSharedResource` 抛错，"重试准备"重复同一路径。升级流程 `update-flow` 是先 `prepareResources`（重发共享集）再逐空间 `prepareRegisteredWorkspace`（完整 prepare，含收敛），但 `syncPackageBuiltins` 对旧引用也可能硬抛，尚未被实测覆盖。已有先例：`preserved-archify.ts` 在共享集替换前把 archify 旧来源封存到 `~/.buildr/local/preserved-skills/archify/` 并让 `resolveSharedResource` 兼容解析。

## Goals / Non-Goals

**Goals:**
- 打开空间时对落后采用自动完成"收敛 → 投射 → 采用"，无需人工重试
- 收敛过程对无法解析的旧 `resource:` 引用降级，不再中断整次同步
- 删除/改名共享技能资源时有一个发布窗口的退役保护，杜绝裸删导致的硬失败

**Non-Goals:**
- 不给自举 runner 增加跨空间同步职责；跨空间覆盖仍由升级流程 update-flow 承担
- 不改变 `resource-set.json` schema 与共享集布局；封存继续放在 `local/preserved-skills/` 下
- 不改变本地定制、required component 冲突、自举空间的既有边界与确认路径

## Decisions

**1. 打开失败自动接续完整准备，而非保留人工重试按钮**
`prepareWorkspaceForOpen` 在 `refreshResourceProjection` 返回 `failed` 时，不再把 ready 结果连同 `resourceRefresh: failed` 直接交回，而是转入与从列表进入相同的 `select → start` 完整准备。理由：refresh 失败的唯一可达成因是共享集与清单不一致，收敛是确定性的唯一恢复动作，让人多点一次只是绕路。本地定制冲突、目录变化、身份冲突等仍需人决定的分支自然走既有 `prepareRoot` 错误路径（`workspace_customizations_pending`、`workspace_identity_conflict` 等），保留现有确认 UI 与选择。自举空间在 `adopted.ready` 时本就走 refresh——把 refresh 失败接续到 `prepareRoot` 会先撞上 `workspace_self_bootstrap_owned`，保持自举边界不破，且错误信息不变更清楚；只在 refresh 成功或空间无 `buildr-self-bootstrap` 组件时走正常路径。
备选：保留"重试准备"按钮、由按钮触发完整准备。放弃理由：加一次人工介入没有决策价值，且仍要求用户理解内部概念。

**2. 收敛对旧 `resource:` 解析失败降级**
`syncPackageBuiltins` 中 `liveSnapshot` 解析 `existing.resource` 失败时按 `null`（无本地快照）处理，让 `resolveBuiltinState` 给出 missing/modified 判定、`handleSkillReplacement` 走 `replaces` 迁移。理由：完整性裁决的权威是本地 receipt + 共享集 sha256，旧引用解析失败只表示源不可达，不等于内容被改；硬抛会把一个可自愈的局部状态变成整次同步失败，并让升级流程在首个旧清单空间处中断。
备选：解析失败时直接跳过该条目、不收敛。放弃理由：把空间永久卡在旧清单，与"打开即收敛"目标相悖。

**3. 退役封存泛化 archify 机制，而非共享集内保留旧条目**
删除/改名技能时，发布方在包清单里声明 `replaces` 或 `retired`；`publishPackageResources` 把被退役来源按 archify 同款流程封存到 `local/preserved-skills/<id>/`，`resolveSharedResource` 对登记过的退役来源继续返回封存文件。理由：共享集本身保持"当前官方资源"的语义纯净，封存是可重建的迁移来源而非第二权威；`resolveSharedResource` 只需在描述符查无条目时再查封存目录，改动局部。包检查（`static-validation` 层）对"manifest 中消失、上个共享集里仍存在"的技能资源要求声明，否则报错——把本次踩坑固化为门禁。
备选：在当前共享集里为退役技能保留原路径占位（deprecated marker）。放弃理由：会让共享集同时携带新旧两份来源，且与"共享集仅包含当前能力资源"的现有要求冲突。

**4. 不扩展自举 runner 的跨空间职责**
跨空间收敛已有三档覆盖：升级流程逐个 prepare、打开时自动收敛（本变更）、doctor 的 `workspace.resources_outdated` 观测。保持自举 runner 只负责自举空间，避免把单个空间的收敛副作用扩张为跨空间写入。

## Risks / Trade-offs

- [打开时自动收敛会写空间源资产（`skills/manifest.yml`、`.buildr/builtin-receipts.json` 等）] → 收敛输出本就是受管官方资产、由 `syncPackageBuiltins` 的 receipt 与 modified 判定保护；本地定制走既有确认分支，不静默覆盖。改动语义从"打开=只刷新投射"扩大为"打开=落后时收敛"，在 spec 中显式声明。
- [自动收敛期间空间页面已可见，进度不可见] → refresh/收敛失败按 banner 报告；收敛按既有 `prepareRoot` 流程走，有 progress 事件可复用，前端沿用现有准备中提示即可。
- [退役窗口"何时结束"需要明确判定] → 采用"下一次发布时仍封存的来源继续封存，直到空间清单收敛"的保守口径；窗口结束条件先定为：封存来源已不在任何已知空间的采用清单引用中，或产品发布流程显式声明退役完成。具体判定放入实现，spec 只要求语义。
- [包检查门禁需要"上次共享集包含什么"的事实] → 以"当前包 manifest 声明的资源集合 vs 包源目录实际存在的技能目录"为可核对事实：源目录消失且 manifest 无 `replaces`/`retired` 声明即报缺失，不需要跨版本比对。

## Migration Plan

- 顺序：先做 ②收敛降级 + ③封存机制与门禁，再做 ①打开自动收敛；这样自动收敛踩到旧清单时 ②③ 兜底已就位。
- 兼容：已 `ready` 空间首次打开走自动收敛；失败降级为既有 banner 提示，不阻塞其他工作。
- 回滚：全部是行为级修改，无 schema 迁移；回滚即恢复"打开只刷新投射"的旧路径，已收敛空间不受影响。
