## Why

本机开发组合已可使用，但没有面向用户的安装发现、发行候选与恢复入口。现在需要独立发行 Harness 和 DSH 插件，同时保留已运行的开发工作与 Development 发行身份。

## What Changes

- 正式发布 `@buildr-ai/buildr-harness`（CLI、Web、启动器）和 `@buildr-ai/dsh-buildr-harness`（桌面接入）；插件 npm 与 GitHub Release 使用同一原包。
- 插件核对相应正式或开发实例，不静默安装。开发入口显示 Buildr Harness Dev，常规 Harness 更新不要求重启宿主。
- DSH 0.2.x 系列声明与实测版本分开，运行时按能力降级；补可复用的候选与发行操作。
- 不改旧包名、数据根或 Development 发布语义；无预期破坏性变更。本次实施不授权公开。

## Capabilities

### Modified Capabilities

- `harness-dsh-desktop-plugin`: 正式安装发现、宿主兼容和开发更新。
- `harness-independent-distribution`: 两个新增发行目标、双渠道原包与独立版本。

## Impact

Harness 包生产与启动接口、DSH 接入层、维护者发布工具和用户安装说明。见[任务说明](@task/harness-first-release)。
