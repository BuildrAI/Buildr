## Why

当前 DSH 提交说明沿用桌面最高推理级别（Reasoning Effort），一次简单撰写也承担高推理开销；提交规范摘录还会遗漏独立的中文写作要求，使结果错误地跟随英文历史。用户已选择让提交说明使用同一模型（Model）声明的最低受支持级别，并保留桌面聊天设置。

## What Changes

- 对 DSH 提交说明增加仅本次调用生效的轻量执行请求：沿用已确认桌面后台、模型（Model）、原生认证和路由，由原生模型声明确定最低受支持推理级别（Reasoning Effort），经准备调用确认后才生成。
- 模型声明不可读取、可选级别含未知语义或准备确认值不一致时局部失败，保留草稿；不猜测 `low`。成功读取且不支持可选推理级别（Reasoning Effort）的模型（Model）省略级别覆盖，普通未指定轻量策略的调用继续继承桌面设置。
- 修复提交资料的规则摘录，保留适用的显式输出语言要求及作用域顺序；语言继续来自当前规则，产品不固定中文。
- 协调现有规范中“DSH 始终继承桌面推理”和“提交说明一律低推理”的冲突，并校准既有使用说明。
- 无公开接口或持久数据的破坏性变更；不增加模型设置界面、耗时分析平台或新生成执行者。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-operations`：区分 DSH 普通继承调用与明确请求的最低受支持推理级别（Reasoning Effort），要求原生声明和准备确认一致。
- `code-source-control`：提交说明经同一生成链路请求轻量执行，明确 DSH 的无会话（Session）桌面调用和显式语言规则的保留。

## Impact

- `projects/product/services/buildr/`：提交材料与内部执行请求、DSH 桌面传输契约及相关测试；Codex 已确认 `low` 的既有行为保持兼容。
- `projects/product/services/dsh-plugin/`：桌面桥从官方原生模型目录读取最低受支持级别、准备及确认本次配置；无桌面全局写入。
- `projects/product/knowledge/docs/architecture/agent-integration*.md` 与随包 `buildr` 技能（Skill）的 `references/agent-operations.md`：解释普通继承与轻量提交生成的区别。现有图示主干关系不变，按实际标签复核。
- 验收使用规则摘录回归、桌面桥配置确认/局部失败测试及真实源码的一次生成；不把模拟测试当成真实桌面性能结论。
