# 预览沿用开发版环境

## Why

预览（Preview）以独立应用数据根启动，开发版（Buildr Dev）配置的模型账号、provider 登录与已安装程序在预览中不可见。当前只能手工复制 `model-access`，既无法真实调用智能体（Agent），又依赖绝对路径与文件身份，直接复制会失效；`preview stop` 还会保留整个实例目录，凭证副本、程序副本和预览会话在收尾后残留。需要把“从开发版沿用环境事实”收敛为可复用、可隔离、可清理的统一能力。

## What Changes

- 新增验证环境沿用（Environment Reuse）能力：预览按 facet 注册选择性沿用开发版环境，显式参数 `--reuse <profile>[:facet,…]`，首版来源为 `development`。
- 首版 facet：
  - `model-catalog`：复制模型账号、缓存模型与启用偏好，预览可见开发版启用的模型。
  - `agent-runtime`：在 `model-catalog` 基础上沿用 provider 登录配置与所需已安装程序，在预览内重建连接绑定，使预览可真实调用智能体（Agent）。
- 预览会话、附件、交接材料与模型运行缓存继续由预览本地创建，不复制开发版会话。
- 缺失时播种；重启复用已有副本；`--refresh-reuse` 显式重新复制 facet 归属内容。
- `preview stop --purge` 在停止确认和 owner 校验后删除整个实例目录；默认 `stop` 继续保留数据。
- 预览 owner/instance 记录与启动结果报告沿用来源、facet 与时间；所有 facet 写入限定在预览实例根内。
- 不包含破坏性变更：未传新参数的预览启动、列表与停止保持现有行为和已发布 JSON schema。

## Capabilities

### New Capabilities

- `preview-environment-reuse`

### Modified Capabilities

无。既有预览生命周期与 CLI 公开契约保持不变，新参数属于同一能力的增量。

## Impact

- `services/buildr`：`web/application` 预览生命周期、facet 注册与清理，`web/interfaces/cli` 参数与帮助，preview owner/instance schema 的可选字段。
- `services/buildr-agent`：连接状态从开发版数据根迁移到预览数据根时的路径重定位与绑定重建支持。
- 测试：preview 生命周期单元/集成测试、CLI 参数测试、隔离与清理断言；不调用付费模型，使用测试提供者或预置夹具。
- 文档与知识：CLI 帮助、预览能力说明、代码地图中相关模块职责。
