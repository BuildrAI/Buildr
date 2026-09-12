## Why

现有技能（Skill）对小改动仍可能要求多类资料调查、重复回归和无必要的原型询问。用户已确认缩小这些默认动作，使工作量与实际影响匹配，同时保留真实结果、授权和必需检查。

## What Changes

- 仅在核心规则第 7 条末尾补充验证范围及停止条件；术语表达要求不变。
- 任务验证（Task Verification）先核对并复用有效检查，只补必要覆盖；报告登记不触发重跑。
- 任务分流（Task Triage）按改动影响调查，仅对存在实质设计选择的界面变化询问原型。
- 代码架构（Code Architecture）仅在结构设计、跨模块重构或明确要求时输出完整地图。
- 工作能力适配（Agent-managed Capability Adaptation）先判断协作影响，再按需读取依赖、候选和激活细节。
- 四个技能（Skill）精简描述并按需披露操作细节；不改变接口、数据结构或能力契约（Capability Contract）版本，无接口破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：限定首次调查范围。
- `product-agent-skills`：验证证据复用、原型询问条件、地图输出范围及按需读取。
- `ui-prototype`：原型询问限于存在实质设计选择的界面变化。
- `skill-capability-contracts`：先判断协作影响，再建立依赖基线。

## Impact

修改随包核心规则与四个技能（Skill）的源文件，按需要增加参考文件并更新资源登记及相关现有检查。对应规范同步收敛；真实授权、项目必需检查、报告真实性及自举同步责任保持不变。
