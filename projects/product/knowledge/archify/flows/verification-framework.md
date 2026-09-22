# Buildr 测试建设与使用图的来源与边界

[打开图示](verification-framework.html) · [图源](verification-framework.json) · [完整验证框架](../../docs/architecture/workspace-testing-and-verification-framework.md) · [实现地图](../../code-map/verification-framework.md)

这张流程图（Workflow）以六个节点表达“使用主线＋按需补建”：智能体（Agent）从本次目标查阅项目与服务已有能力，选择并执行测试，再核对证据；缺少必要测试或发现覆盖缺口时，按需建设测试、核对和更新声明后继续验证。

图中的箭头表达工作的衔接，不是 Buildr 自动运行的固定流程。智能体（Agent）负责判断、建设与执行；Buildr 提供方法、项目测试地图及正式报告的维护能力。项目和各服务拥有真实测试、入口、工具与环境，可以采用不同技术，也可以从没有测试能力开始建设。

## 图中三项技能及用途

三张说明卡片默认可见，分别对应图中的测试建设、声明核对，以及能力查阅、执行与结果交付。

| 技能（Skill） | 用途与当前依据 |
| --- | --- |
| `project-testing` | 指导设计或完善能够捕获目标错误的测试，选择最低充分边界，维护真实用例、隔离和执行入口；不写 `verification.yml`。见[技能正文](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md)与[测试模型](../../../services/buildr/resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md)。 |
| `declaration-intake` | 核对已登记项目和服务中的真实入口、当前声明及差异，明确需要维护的内容并交给对应维护者；不直接写声明。见[技能正文](../../../services/buildr/resources/workspace/skills/buildr/declaration-intake/SKILL.md)。 |
| `task-verification` | 指导维护 `verification.yml`，根据目标、改动、环境和测试地图选择已有检查，由智能体（Agent）直接调用项目工具；本轮验证完成后按需保存正式任务验证报告。见[技能正文](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)、[地图维护说明](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/maintain-map.md)与[报告登记说明](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/record-report.md)。 |

这些技能（Skill）提供方法，不是三个自行执行测试的软件服务。地图和报告的确定性维护由 Buildr 相应应用提供；实现入口见[框架代码地图](../../code-map/verification-framework.md)。

## 主线与分支的事实依据

| 图中关系 | 含义与当前依据 |
| --- | --- |
| 目标与改动 → 查阅项目与服务测试能力 | 结合用户目标、当前变更、真实入口和测试地图识别所需证明；地图不替代对当前事实的检查。见[任务验证技能](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)。 |
| 查阅能力 → 选择执行 → 核对结果 | 已有能力满足本次目标时直接使用；按真实路径根和已声明入口执行，核对实际覆盖和证据适用性。不同服务不必共用框架或命令。见[声明字段参考](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/project-verification-v4.md)与[任务验证技能](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)。 |
| 查阅能力 → 建设或完善测试 | 缺所需测试时，按当前目标与授权补建；测试用公共结果区分正确与错误实现。见[测试建设技能](../../../services/buildr/resources/workspace/skills/buildr/project-testing/SKILL.md)与[测试指导规范](../../../openspec/specs/project-testing-guidance/spec.md)。 |
| 建设测试 → 核对并更新声明 → 选择执行 | 入口稳定后核对声明变化，由 `task-verification` 维护地图；沿用已有稳定入口的普通用例修改不要求重复登记。见[声明接入技能](../../../services/buildr/resources/workspace/skills/buildr/declaration-intake/SKILL.md)与[地图维护说明](../../../services/buildr/resources/workspace/skills/buildr/task-verification/references/maintain-map.md)。 |
| 核对结果 → 按需补齐覆盖 | 发现缺测试、测试失配或漏选时，在授权范围补齐；无法处理则明确报告缺口。执行失败还应判断实现问题，不把所有失败当作新建测试的理由。见[任务验证技能](../../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md)。 |

主线的无文字箭头由两端动作直接说明衔接；分支文字区分“能力已具备”“缺所需测试”和“按需补齐覆盖”。虚线只表示按需反馈，不表示后台自动触发。

## 保留在文章中的细节

`verification.yml` 是项目文件，登记稳定测试族（Testing Family）、证明范围、路径根、完整入口与选择方式；它不是逐个测试文件的清单，也不意味着 Buildr 统一运行测试。Buildr 的地图维护应用读取、校验并按已观察版本安全写入该文件。

各服务的局部测试和项目跨服务业务旅程分别承担证明责任；局部通过不能自动合并为整体通过。缺少测试、未执行、环境不匹配和执行失败须分别说明。真实工具输出是执行证据；正式任务验证报告（Task Verification Report）保存本轮检查、结论和未覆盖项，登记不会重跑测试，也不等于业务验收或任务完成。没有正式任务（Task）时可以直接交付验证结果。

可选测试上下文运行时（Test Context Runtime）的适用条件见[运行时说明](../../docs/guides/node-test-context-runtime.md)；Buildr 自身的 `test:integration`、`test:system` 和执行注册表（Registry）见[采用实例](../../docs/architecture/verification-framework.md)。它们不作为所有用户项目的前提，也不进入这张主图。

## 生成与检查

图源采用 Archify 流程格式第二版（Workflow v2），含 6 个节点和 7 条关系，以 `deliver workflow` 生成独立 HTML。最终展示质量检查为 9/9，构图错误和警告均为 0；交付回执绑定图源及展示文件的内容摘要。实际页面的视觉检查另行核对，结构检查不代表测试框架运行行为已验证。
