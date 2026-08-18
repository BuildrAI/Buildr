# Task Intent 可点击文档引用

## 一句话摘要

让任务意图中的重要 Project Markdown 文档以普通链接呈现，用户点击即可在 Task 页面内只读查看。

## 背景与问题

Task Intent 当前只显示纯文本。即使任务明确参考 `service-architecture.md`，用户仍要手工查找文件，无法从任务上下文直接查看关键资料。

## 目标与非目标

目标是复用已有 Intent、受限 Markdown renderer 和 Project Document API，支持用户可读名称、Workspace 相对路径和点击预览。非目标是不新增附件表、引用状态、Planning gate、任意文件读取或文档编辑能力。

## 受影响用户或角色

- 查看父任务及其重要参考资料的普通用户。
- 通过 Task Intent 维护任务目标与资料入口的 Agent。

## 核心流程

用户打开 Task 详情，看到 Intent 中的文档名称链接；点击后页面在不离开 Task 的情况下展示文档名称、Project 相对路径和 Markdown 正文。缺失、越界或非 Project Markdown 引用得到明确提示。

## 关键变化

- Task Intent 使用受限 Markdown 呈现。
- Workspace 相对路径按 current Project registry 的 source path 解析。
- 只读 Modal 复用 Project Document API，并允许同一 Project 内的相对 Markdown 导航。
- Task Record schema、writer 和搜索语义保持不变。

## 影响、风险与兼容性

变更主要位于 Buildr Web；`buildr` 继续托管构建产物和既有 Project Document API。旧纯文本 Intent 保持等价展示。主要风险是错误路径被误当成本地读取入口，因此解析严格限定到 Task scope 内已登记 Project 的 `.md` 文件。

## 验收摘要

- 父任务 Intent 中的 `Buildr Service Architecture` 显示为可点击链接。
- 点击后展示真实 `service-architecture.md` 内容和路径。
- 非法、缺失和越界引用不会读取其他 Workspace 文件。
- 生产托管 browser smoke 覆盖完整点击流程。

## 技术 Artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [tasks.md](tasks.md)
- [delta spec](specs/local-app-web-client/spec.md)
