## Why

DeepSeek 当前固定报告额度不可读，遗漏其余额制权益；用户也无法在右下角入口快速查看所有已登录账号的可用额度。

## What Changes

- 使用 DSH 官方账号已有的余额查询能力，读取充值与赠送钱包，保留币种与十进制金额。
- 右下角账号按钮增加悬停及键盘聚焦浮层，逐账号显示真实额度窗口或账户余额，点击仍进入设置。
- 未知、失败及旧观察明确表达，不制造百分比或零余额，不改变模型选择与登录。
- 不含破坏性变更（Breaking Change），只增加可选字段与现有入口展示。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-usage-controls`：增加原生余额观察与全账号悬停概览。

## Impact

涉及 `buildr-agent` 账号观察与 DSH 官方只读能力、`buildr-web` 现有停靠入口和账号卡片、公开数据传输对象（DTO）生成及相关测试。无新增依赖、凭据存储或外部写入。[任务说明](@task/account-balance-hover)。
