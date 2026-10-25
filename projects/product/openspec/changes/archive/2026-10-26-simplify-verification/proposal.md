## Why

当前测试分类、执行集合、发布阶段和操作系统要求混合，主体快速入口不能代表四个服务的全量检查，智能体（Agent）还要在测试建设、声明接入与任务验证之间重复交接。用户要求统一为四类检查、两个技能（Skill）和可直接理解的命令，先实际运行再判断合理成本。

## What Changes

- **BREAKING**：正式分类仅保留 `Static`、`Unit`、`Integration`、`E2E`；删除旧的组件、系统、冒烟、平台并列分类及日常档位，迁移有效断言并清理旧入口与现行说明。
- **BREAKING**：`project-testing` 负责测试建设和稳定能力登记；`task-verification` 技能（Skill）改名 `project-verification`，负责选择、执行、证据判断与报告；移除独立 `declaration-intake` 技能（Skill），准备声明职责回归产品入口指引。
- 提供四服务统一的 `npm test`、`check`、`test:static`、`test:integration`、`test:e2e`、`test:related`；支持只看计划、明确基线的相关选择和无需任务或基线的显式检查选择。
- 开发按目标选齐必要检查，推送前完整覆盖静态检查（Static Check）与单元测试（Unit Test），用户可直接要求任意检查。现有结果记录应用协议保留，不因技能名称变化改写历史。
- 保留准确原包、真实系统和外部副作用授权边界；移除耗时预算准入，继续安全超时、有限并发及临时资源隔离。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`：四类分类、统一命令、相关与显式选择、两类全量和非阻断耗时。
- `agent-task-workflows`：两个技能（Skill）的职责及开发、推送前、用户显式要求的执行规则。
- `product-agent-skills`：更名和退役技能（Skill）的发现、绑定及源资产维护。
- `project-testing-guidance`：测试建设、四类判定与登记的唯一职责。
- `cli-modular-architecture`：统一公开命令与执行层。
- `buildr-package-assets`：新默认提供者及稳定应用协议的组合交付。
- `workspace-control-plane-module-architecture`：澄清声明发现应用与已退役技能（Skill）的边界。
- `project-declaration-intake`：撤销独立接入层，测试能力登记与准备声明分别回到各自维护者。

## Impact

影响四服务的测试组织与包脚本、主体检查登记与执行器、持续集成（CI）、发布执行器的内部调用、产品随包技能源和项目说明。历史任务验证报告、历史规范归档和上游 OpenSpec 不改写；不公开发布、不自动推送、不从候选工作树更新共享运行时（Runtime）。
