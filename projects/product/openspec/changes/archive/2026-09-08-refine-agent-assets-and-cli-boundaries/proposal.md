## Why

当前 `df61f0cd` 中共享资产装配仍隐藏依赖，应用混入命令输出，资源文件保留不可达解析与跨模块登记规则，架构扫描遗漏 TypeScript 生产源码。已有测试通过不能证明这些边界成立。本轮在保持公开行为下修复四项问题，无破坏性变更。

## What Changes

- 按技能（Skill）、命令（Command）、组件（Component）及包维护职责显式装配窄依赖，缩小内部方法可见范围。
- Doctor、安装状态及相邻更新入口的参数解析、打印和退出码归属接口（Interface），应用（Application）接收结构化输入并返回结果。
- 删除不可达旧解析；包资源读取、资产比较与项目/服务登记修复分属真实所有者。
- 架构检查覆盖当前生产源码扩展名，并以失败样本验证扫描有效；更新实际代码地图。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-assets-module-architecture`：明确应用依赖和登记修复边界。
- `runtime-host-doctor-module-architecture`：明确 Doctor 结构化调用与生产源码扫描。
- `system-installation-module-architecture`：明确安装状态及更新命令的接口输出责任。

## Impact

涉及 `services/buildr/src/modules/{agent-assets,diagnostics,installation,workspace}`、所属命令入口、真实调用方、架构与行为测试和当前架构说明。保留公开 CLI、HTTP、JSON、持久化结构和已有业务效果；不调整 Task/Workspace 已合理结构及前端。
