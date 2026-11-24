## Why
Magpie 当前目录只公布 GPT‑6.2 Sol 和 Astra 的 Codex 默认窗口，Buildr 把这个值当作配置上限，导致官方支持的较大窗口无法保存。

## What Changes
区分默认上下文窗口和可配置上限。优先采用 Magpie 的显式最大窗口，仅在明确识别到官方 Codex 默认值的两条直接订阅模型上，补齐官方已公布的上限。其他模型、路由以及未知或不同的窗口维持保守行为。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `magpie-model-provider`：保留默认窗口，区分有依据的配置上限。

## Impact
Magpie 模型目录映射、现有模型配置校验与窗口说明；不改变订阅源、请求协议或默认窗口。
