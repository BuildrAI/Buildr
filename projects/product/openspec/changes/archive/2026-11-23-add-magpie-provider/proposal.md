## Why

通用端点已经验证可连接 Magpie，但用户目前仍需要自行安装和配置，也不能直接区分同名模型的接入路径。

## What Changes

- 增加内置 Magpie 模型供应商，支持连接已运行的本机实例，或由用户主动准备并启动受管实例。
- 沿用现有模型选择器的布局、分组和选择规则，仅对 Magpie 模型在名称末尾追加 ` · Magpie`。
- 暂不加入供应商总额度或模型额度映射。无破坏性变更。

## Capabilities

### New Capabilities

- `magpie-model-provider`：本机网关发现、准备、连接及来源显示。

### Modified Capabilities

无。

## Impact

Harness 模型来源、模型管理接入面板与对话模型选择器；不更改 Harness 协议、订阅登录或其他来源配置。
