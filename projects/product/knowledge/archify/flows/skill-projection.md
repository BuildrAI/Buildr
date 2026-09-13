# 技能投射技术图：来源与边界

[打开技术图](skill-projection.html) · [编辑图源](skill-projection.json) · [代码地图](../../code-map/skill-projection.md) · [解释文档](../../docs/architecture/buildr-skill-system.md)

图源和展示覆盖 Buildr 服务（Service）中技能源文件到目标目录的主要数据关系，以 Codex 工作空间（Workspace）输出作为例子。它是数据流图（Data Flow Diagram），不表达逐函数执行顺序，也不表示新增持久对象。下面说明覆盖 JSON 与 HTML 两个同名文件的事实来源及表达边界。

## 节点与关系的依据

各符号的准确路径和职责见[代码地图](../../code-map/skill-projection.md)。

| 节点或连线标识 | 依据 |
|---|---|
| `skill-source`、`read-source` | `sources.ts` 的 `resolveSkills` 读取工作空间技能源清单与目录 |
| `component-source`、`compose-source` | `contributions.ts` 的 `resolveComponentContributions` 核对成员后组合片段与依赖；`resolveSkillCapabilityGraph` 解析实际绑定 |
| `resolved-skills` | `render-plan.ts` 的 `resolveRenderSkills` 返回附带局部能力视图的普通技能 |
| `render-plan`、`prepare-files` | `buildSkillRenderPlan` 与 `buildSkillContent` 构造正文、附属文件及归属记录计划 |
| `reconciler`、`check-writes` | `application/runtime-projection.ts` 的 `renderSkillsRuntime` 在目标与发现冲突检查后将计划交给 `reconcileRuntimePlan` |
| `runtime-files`、`write-runtime` | `buildRuntimeSkillDirectory` 使用 `getRuntimeAdapter` 的布局；协调器写入实际改变的受管目标 |
| `ownership`、`write-ownership` | `buildSkillProjectionReceipt` 构造本机记录，由计划的记录写入分支保存；目录内容通常先于标记为 `commitLast` 的记录 |

排除：全部规则投射、远程来源读取细节、所有安装模式、全部适配器布局、宿主实际会话加载，以及任意写入失败下的通用事务保证。产品入口 `buildr` 从随包来源独立进入相同计划机制，卡片仅说明其来源，未在主图展开。

## 维护与核验

先检查关系语义，只有来源变化真正影响节点或连线才修改图源。更新图源后使用已安装 Archify 的 `validate dataflow`、`deliver dataflow` 和 `visual-check`，展示保持同名同目录；不手改 HTML。完整方法见[当前知识维护](../../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md)。

本次图源通过 9 项展示级检查，0 错误、0 警告；1440×900、1600×1000、1920×1080、2048×1320 四个桌面尺寸均未溢出。已实际查看 1440×900 浅色和 2048×1320 深色截图，节点、连线和说明无遮挡；自动视觉报告的 `visualReview: pending` 保持原值，人工查看不冒充自动结论。交互验证与最终检查记录见同次变更的验证说明。

同名 `.visual-check.json`、联系页和截图是生成检查证据，不能替代节点关系的来源核对。图源与展示的摘要由交付命令返回，后续检查应对应实际文件。
