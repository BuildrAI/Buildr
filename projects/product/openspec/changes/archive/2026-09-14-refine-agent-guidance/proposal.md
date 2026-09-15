## Why

现有指引已强调按影响工作，但 OpenSpec 上游的阶段停止要求、Buildr 增强片段的重复检查，以及冗长入口仍可能抵消该原则。用户已批准六类优化，并明确保持 OpenSpec 上游原文。本次无数据或接口破坏性变更。

## What Changes

- 通过增强片段（Skill Contribution）解释已有授权的延续、局部修复和检查复用。
- 精简 Buildr 自有技能（Skills）描述，将入口分支细节放入按需参考。
- 消费同步已有诊断，按真实影响复用组合验证；收窄产品规则的资源检查范围。
- 保持外部正文、能力绑定（Capability Binding）和协作契约（Contract）版本不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`：OpenSpec 增强明确已有授权、局部错误修复与阶段检查复用。
- `product-agent-skills`：扩展按影响控制工作量的描述、正文与诊断复用要求。

## Impact

涉及 Product AGENTS.md、resources 内自有技能和 OpenSpec 增强片段、随包清单、组件完整性及对应检查。保留所有上游 OpenSpec 字节；不改变业务接口、授权来源或发布权限。
