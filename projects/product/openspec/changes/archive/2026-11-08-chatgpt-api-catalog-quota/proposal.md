## Why

ChatGPT API 来源已经可以读取真实模型目录，但目录项仍只显示原始 id 并保守地把图片能力固定为 `false`、不提供任何推理档位；这与 OpenAI 官方模型页对 `gpt-6.1-sol` 等模型的能力描述不一致。Qoder 个人账号的 `/usage` 实际把可用额度放在 `addOnQuota`，当前代码只读取 `orgResourcePackage`，并把套餐额度 0% 当作账号耗尽，导致资源包仍有余额时也可能阻止执行；同时 `app` 分组中的 `QoDuck` 没有进入模型目录。模型选择器的来源快捷行还会折成两行，订阅来源仍显示为 `Codex`，与 `ChatGPT API` 的区分不直观。

## What Changes

- 为 ChatGPT API 目录增加基于 OpenAI 官方模型页的能力目录：统一显示名、图片输入、工具、上下文窗口、最大输出与推理档位；快照 id 归一为基础模型，未知模型保持保守表达。
- 过滤不属于文本对话用途的 `gpt-live-*` 与 `search-api` 模型，避免把不受 Responses 支持的模型作为可执行候选。
- 明确 ChatGPT API 余额边界：普通 API Key 无法读取剩余余额时不制造零余额；账号卡片区分模型观察时间与额度观察时间，并指向 OpenAI 平台账单/用量说明。
- 正确解析 Qoder `addOnQuota`（资源包），保留组织资源包兼容；分别展示套餐与资源包窗口，并按可用额度计算账号级剩余比例，避免有资源包时误判耗尽。
- 合并 Qoder `/models` 的 `app` 分组中未出现在 `chat` 分组的真实模型（至少包含 `QoDuck`），按模型 key 去重并保留各自配置。
- 模型候选来源快捷行保持单行；模型来源标签把订阅来源显示为 `ChatGPT`，与 `ChatGPT API` 并列区分。执行智能体仍显示为 `Codex`，不改变执行者身份。
- 模型来源标签按提供模型的厂商显示：DSH 是执行智能体，其接入的 DeepSeek 账号在模型侧显示为 `DeepSeek`，不把执行智能体名称当作模型来源名称。
- 补充 OpenAI、Qoder provider 与 Web 模型选择/账号视图的聚焦测试。

不包含破坏性变更；既有账号、模型 id、对话绑定和执行器协议保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-provider-api-access`: ChatGPT API 目录从官方模型页补充已确认能力与统一显示名；余额不可读时明确未知并区分模型观察时间。
- `model-usage-controls`: Qoder 同时表达套餐额度与资源包额度，账号级剩余比例按可用额度计算；模型来源展示为 ChatGPT 与 ChatGPT API 两个相邻分类。
- `unified-model-subscriptions`: Qoder 模型目录合并 `app` 分组中的真实模型；模型来源分类名称与执行智能体名称明确分离。

## Impact

- `projects/product/services/buildr-agent/src/model-access/providers/openai-api.ts`：目录能力、显示名、过滤与余额说明。
- `projects/product/services/buildr-agent/src/model-access/providers/qoder.ts`：`addOnQuota`、资源包窗口、账号级剩余比例与 `app` 分组目录合并。
- `projects/product/services/buildr-web/src/lib/model-picker.ts`、`src/components/model-picker.css`、`src/features/agent-conversations/account-model-view.ts`：来源标签、单行快捷行、观察时间与额度说明。
- 相关 provider 单元/集成测试与 Web 模型展示测试。
