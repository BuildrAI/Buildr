## Why

目前统一更新只检查 Buildr，智能体（Agent）程序准备只核验固定兼容版本。用户无法从统一入口或智能体设置判断当前程序是否有新版本，需要统一的只读检查能力。

## What Changes

- 为已绑定程序检查官方发布版本、当前程序版本、来源与检查时间，分开报告失败。
- 统一更新及智能体设置共用能力，保留原有 Buildr 安装流程。
- 不自动安装、重启、改绑或修改用户配置；无破坏性变更。

## Capabilities

### New Capabilities
- `agent-program-updates`: 智能体程序只读更新检查与两个界面入口。

### Modified Capabilities
无；原有程序准备与 Buildr 更新承诺不变。

## Impact

涉及 `buildr-agent` 的程序检查、公开操作与数据契约，`buildr` 的受认证网页接口，以及 `buildr-web` 两处入口。无需新增依赖；官方软件包发布信息只读访问。Qoder 程序与配套软件包版本不可直接互比。
