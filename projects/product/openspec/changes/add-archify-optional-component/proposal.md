## Why

Archify 目前只在用户级目录独立安装，Buildr 无法统一管理其来源、版本、安装与卸载。将经过校验的完整上游发行内容作为可选组件（Component）随包交付，让其他工作空间（Workspace）按需获得同一绘图能力；本次不包含破坏性变更。

## What Changes

- 随包提供 Archify 2.16.0 的完整正式发行内容，保留上游正文、程序、模板及许可证。
- 新增默认不启用、允许卸载的 `archify` 内置组件（Component），复用现有安装、更新、卸载与投射能力。
- 核验来源、完整性以及安装后的渲染能力，覆盖重复同步、用户修改保护与卸载保留项目图文件。
- 保留用户级同名安装；遇到同名冲突沿用现有诊断，不自动接管或删除。

## Capabilities

### New Capabilities

- `archify-component`: 定义 Archify 随包可选组件（Component）的发行来源、默认状态、完整目录交付和使用边界。

### Modified Capabilities

无。沿用现有组件（Component）生命周期与所有权保护。

## Impact

修改 `services/buildr/resources/manifest.yml`，新增随包定义及完整技能（Skill）目录、相关测试和使用说明。不修改 Archify 上游行为，不新增跨技能（Skill）依赖，不将绘图设为开发或交付前置条件。实际安装到当前用户环境需遵守现有同名冲突与自举边界。
