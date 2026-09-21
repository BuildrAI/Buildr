# 技能源文件到可发现入口

覆盖 Buildr 服务（Service）中普通技能源文件的解析、内容组合、文件计划与运行时投射（Runtime Projection），以 Codex 单运行时根（Runtime Root）和 Qoder 主根加镜像根（Mirror Root）的工作空间（Workspace）目录为具体输出示例。事实来源是下列真实代码、[资源清单](../../services/buildr/resources/manifest.yml)、[投射规范](../../openspec/specs/workspace-first-runtime-projection/spec.md)和[组件增强规范](../../openspec/specs/buildr-package-assets/spec.md)。

本图不展开全部规则投射、远程来源读取、组件安装与删除、宿主会话加载及全部适配器。产品入口 `buildr` 的随包来源单独说明；它不通过普通工作空间技能冒名接入。关联[面向人的解释](../docs/architecture/buildr-skill-system.md)、[技术图](../archify/flows/skill-projection.html)及[图的来源映射](../archify/flows/skill-projection.md)。

## 真实目录与对象

以下目录相对 `services/buildr/src/modules/agent-assets/`，链接直接进入实现：

```text
agent-assets/
├── application/runtime-projection.ts       # 请求范围、目标保护、组合和应用
├── persistence/
│   ├── skill-manifest.ts                   # 源清单与协作约定解析
│   └── capability-graph-repository.ts      # 依赖与选定提供者
└── infrastructure/runtime/
    ├── projection.ts                      # 组合声明式目标计划
    ├── adapter-contract.ts                # 选择适配器与目标布局
    ├── runtime-reconciler.ts               # 比较目标、冲突检查和写入
    └── skills/
        ├── sources.ts                     # 普通技能与产品入口来源
        ├── contributions.ts               # 组件成员核对与正文/依赖增强
        ├── render-plan.ts                 # 组合正文、附属文件和归属记录计划
        ├── projection-files.ts            # 文件内容、摘要和归属记录格式
        └── inventory.ts                   # 跨发现位置的候选冲突判断
```

| 对象与代表方法 | 实际职责 | 直接来源 |
|---|---|---|
| `registerApplicationRuntime` 内的 `renderSkillsRuntime` | 解析目标与投射位置，校验候选不能写共享位置，组装计划并检查已有发现位置，最后应用计划 | [runtime-projection.ts](../../services/buildr/src/modules/agent-assets/application/runtime-projection.ts) |
| `assembleRuntimeProjection` | 根据选择组装规则、产品入口和工作空间技能的计划；本地图只展开技能支路 | [projection.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/projection.ts) |
| `resolveRenderSkills` | 为普通技能关联当前工作空间依赖图中的局部绑定；拒绝已退役的项目技能安装范围 | [render-plan.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/render-plan.ts) |
| `resolveSkills`、`resolvePackageAgentSkill` | 前者读取 `skills/manifest.yml` 并附加组件贡献；后者解析随包产品入口，两条来源分别进入计划 | [sources.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/sources.ts) |
| `resolveComponentContributions` | 读取已安装组件，核对路径、成员完整性和唯一归属后返回正文片段与依赖增强 | [contributions.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/contributions.ts) |
| `resolveSkillCapabilityGraph`、`capabilityBindingsForSkill` | 解析已有协作约定、依赖和绑定，给每个调用方提供局部视图 | [capability-graph-repository.ts](../../services/buildr/src/modules/agent-assets/persistence/capability-graph-repository.ts) |
| `buildSkillContent`、`buildSkillRenderPlan` | 组合片段与局部能力说明，添加生成标记，生成正文、附属文件与归属记录的写入计划 | [render-plan.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/render-plan.ts) |
| `buildSkillProjectionReceipt`、`skillProjectionOwnershipReceiptTarget`、`skillProjectionReceiptRootSlug` | 表达文件摘要、可执行位和投射身份，按目标根解析记录位置 | [projection-files.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/projection-files.ts) |
| `getRuntimeAdapter`、`skillDestinationRoots` | 前者取得已声明适配器的目标布局，不证明当前执行者身份；后者给出某一投射范围内的全部目标根（主根在前、镜像根在后） | [adapter-contract.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts) |
| `buildEffectiveSkillInventory`、`classifySkillCandidate` | 检查可见位置，区分可写候选、已由用户位置满足和冲突 | [inventory.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/skills/inventory.ts) |
| `validateRuntimePlan`、`reconcileRuntimePlan` | 核对目标安全、当前内容与归属，发现计划冲突时保持零写入；正常时更新实际变化文件并处理已证明可清理目标 | [runtime-reconciler.ts](../../services/buildr/src/modules/agent-assets/infrastructure/runtime/runtime-reconciler.ts) |

## 关键调用与数据流

`renderSkillsRuntime` 调用 `assembleRuntimeProjection`；后者调用 `resolveRenderSkills`，取得 `resolveSkillCapabilityGraph` 与 `resolveSkills` 的结果，再通过 `buildSkillRenderPlan` 生成目标计划。`resolveSkills` 内调用 `resolveComponentContributions`，将适用片段和依赖附到目标技能。图中的“有效技能集合”是这段解析过程的概括，不是新增持久对象。

`buildSkillContent` 按源正文、片段、局部能力说明和生成标记组合 `SKILL.md`。`buildSkillRenderPlan` 同时调用文件枚举及归属记录构造，保持附属文件内容与可执行位。同一技能的正文只组合一次：`skillDestinationRoots` 给出主根与镜像根的有序集合后，每个根复用同一 asset identity 与 render digest 生成自己的写入与删除动作，并各自取得按根分段的归属记录。调用方完成发现位置冲突分类后，由 `reconcileRuntimePlan` 比较并写入目标。相同内容不重复写，已有外部或被修改文件不能被默认覆盖。

## 数据归属与副作用

| 数据或文件 | 归属及读写 |
|---|---|
| 工作空间 `skills/manifest.yml`、技能源目录、组件定义与片段 | 本路径只读；受管内置内容从产品源修改并通过适用同步交付 |
| 组合后的正文、能力局部视图和目标计划 | 内存派生对象，不建立新的工作状态数据库 |
| Codex 工作空间 `.agents/skills/<id>/`（单根）、Qoder 工作空间 `.qoder/skills/<id>/`（主根）与 `.agents/skills/<id>/`（镜像根） | 可重建输出；`reconcileRuntimePlan` 按根更新已验证安全的文件，不回写源技能 |
| `.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/` | 本机投射归属记录，供比较、完整性和后续清理使用；不证明任务目标完成。主根沿用 `<skillId>.json`，镜像根使用 `<skillId>--root-<slug>.json`（Qoder 镜像根为 `--root-agents`）并在记录内写明 `runtimeRoot`，因此一个 Skill 在每个根上的归属与漂移分别判定 |
| 用户级投射目录 | 只有对应已授权目标才可写；候选产品检出目录不能修改共享用户位置 |

冲突预检的零写入保证不等于任意文件系统异常下的全局事务保证：当前协调器仅在旧归属记录迁移分支建立专用恢复快照。图只承诺已核对的冲突预检与受管更新，不宣称所有写入都具备通用原子回滚。

## 如何判断需要维护

来源位置、代表符号、内容组合规则、目标目录、写入归属或冲突保护发生变化时核对本地图及对应图表；内部实现版本变化但上述关系仍成立时只记录检查结论，不机械重建。当前知识维护技能本次新增参考文件而投射算法未变，是“输入变化、这份机制映射仍适用”的具体例子。
