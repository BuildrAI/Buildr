# 打开工作空间时自动收敛共享资源

## Why

共享资源集（`~/.buildr/resources`）内容变化（技能删除/改名、同版本重发）后，持有旧 `skills/manifest.yml` 的工作空间在 Buildr Web 打开时只会重新渲染投射、不会先收敛清单；清单里被移除的 `resource:` 引用使 `resolveSharedResource` 硬失败，且"重试准备"重复同一条路径永远无法自愈（实测：`jixian` 空间清单残留已删除的 `task-verification`，打开即报"本机技能入口尚未刷新"，须手工 `buildr sync` 才恢复）。安装升级流程逐个 prepare 登记空间时也存在同样的旧引用硬崩风险。

## What Changes

- 打开工作空间时，采用标记落后或投射刷新失败 MUST 自动转入完整准备（收敛内置资产清单 → 渲染投射 → 更新采用标记），不再依赖用户点重试；本地定制冲突继续走既有"保留当前定制并继续"确认路径。
- 内置资产收敛对无法解析的旧 `resource:` 引用 MUST 降级为缺源处理，交由既有 modified/missing/replaces 判定，不再硬抛中断整次同步。
- 共享技能资源的删除/改名 MUST 两段式退役：经由 `replaces` 或显式退役声明在共享集中保留一个发布窗口（泛化现有 archify 封存机制），窗口内旧引用仍可解析，之后清理；包检查增加门禁，禁止无退役声明裸删共享技能资源。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `shared-package-resources`: 「失败空间按固定目录的当前资源恢复」——打开时的刷新失败 MUST 自动接续完整收敛而非仅报告；新增「共享技能资源两段式退役」要求；「普通消费不重新发布共享集」语义不变。
- `buildr-product-capability-sync`: 「已有 workspace 升级兼容」——收敛对不可解析旧资源引用的降级语义。

## Impact

- `services/buildr/src/modules/workspace/application/workspace-preparation.ts`：`prepareWorkspaceForOpen`/`refreshResourceProjection` 的失败接续路径。
- `services/buildr/src/modules/agent-assets/application/package-maintenance.ts`：`liveSnapshot` 的资源解析降级。
- `services/buildr/src/infrastructure/product-resources/`：封存机制从 archify 专用泛化为技能退役封存；发布/解析增加退役窗口语义。
- `services/buildr/tools/verification/package-check/`：删除共享技能资源的发布门禁。
- Buildr Web：`WorkspacePreparationNotice` 的展示与重试语义随自动收敛调整（失败提示保留，恢复动作不再需要手工重试）。
- 无破坏性协议变化；`resource-set` schema 不变，封存目录沿用既有 `local/preserved-skills/` 布局扩展。
