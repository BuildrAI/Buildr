## Why

用户在 Buildr 登录一次 Google AI，即可在兼容的 Harness 中选择该账号的订阅模型，并查看剩余额度。

## What Changes

- 内置单一 Google AI 供应商。Agent Service 负责本机代理和授权，已有登录可复用。
- 代理观察成功后，将两个已登记的旧自定义来源退出选择器和供应商列表。保留历史模型绑定，并引导重新选择。
- 模型使用最新 dev 的共享选择器。在同一供应商卡片展示模型、Gemini 与 Claude / GPT 的每周和 5 小时额度。

## Capabilities

- `google-ai-subscription-model-gateway` 覆盖 Google AI 登录、模型发现、额度观察及兼容 Harness 的网关推理。
