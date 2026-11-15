## Context

两产品现有实现通过共享 React 功能包及具名宿主插槽组合。用户明确要求以完整网页为集成边界，而非继续扩展组件装配。本修订保留现有执行协议与历史数据，替代此前的 UI 共享设计。

## Goals / Non-Goals

Goals：Harness 独立负责执行及完整网页；Development 负责工程现场和上下文；实现可定位、独立安装和组合。Non-goals：新推理循环、公开发布、Windows 验收、新增三套 DSH 插件。

## Decisions

1. `buildr-harness` 合并核心、CLI、启动器、发行工具；`buildr-harness-web` 拥有完整网页，撤销共享 UI 服务。Development 保持 `buildr` 与 `buildr-web`。
2. Development 以 `/harness/` 托管核心包携带的准确静态产物，并在 iframe 使用该网页；独立入口也消费同一产物。复用 Development 同源认证，不在父子页面之间传递长期秘密，不扩大跨端口信任。
3. `buildr-web/src/features/harness-ui` 维护工作空间选择、嵌入布局、任务关联和工程参与展示。Harness 内部不注入任务组件。协议只提供 configure/new/open/history/settings 及显式工程上下文交接；当前对话身份向上通知。
4. 消息须匹配准确 origin、Window 和协议；重复就绪不可重发执行交接，未知响应保留待核对，不自动重放。内嵌/专注仅改外围布局，不卸载 iframe，不丢草稿和阅读位置。
5. 包名/源码改名不迁移 agent-service 数据路径，保留控制脚本及存储语义。旧程序入口和运行中代次按已有兼容机制保全。

## Risks / Trade-offs

同源 iframe 是产品模块边界，不宣称成为不可信网页的安全沙箱；页面只能加载随包可信产物。Development 携带 Harness 网页产物但不编译其组件。后续独立工程插件可不装配该集成模块；当前不为未来组合新增功能开关平台。

## Migration Plan

先停止旧任务预览并保留个人账号数据；复用任务隔离工作树；合并核心入口、迁移网页实现及测试、替换 Development 集成，再更新构建、测试登记、服务组成与知识。分别证明独立、内嵌与专注以及包消费；保留失败和未执行范围，不把目录移动当行为验收。
