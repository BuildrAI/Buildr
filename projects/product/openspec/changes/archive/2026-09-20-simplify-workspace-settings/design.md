## Context

现设置页只可写 name/description，其余字段为只读事实。已有 metadata 更新按 revision 保护；顶部切换菜单与全局目录卡片均能取得稳定工作空间身份。原型已确认使用共同抽屉。

## Goals / Non-Goals

保持现有写入和迁移边界，将常用编辑放回当前浏览上下文。不新增工作空间状态、不修改目录与身份、不把退出应用混入工作空间语义。

## Decisions

- AppLayout 组合一个 WorkspaceSettingsDrawer，AppShellContext 暴露显式 workspaceId 打开动作；卡片和顶部菜单都使用同一个实现。
- 客户端提供显式 ID 的读写方法，复用现有传输与本机会话，不临时切换全局 workspaceId。读取正文 revision，不借用目录 registry.revision。
- 保存后用事件/既有刷新上下文更新目标卡片和当前顶部名称；抽屉保留原页面，关闭和取消遵循现有表单习惯。
- 去掉 ID/schema/revision 的日常展示，本地目录保留一行只读；异常时展示必要诊断。冲突保留草稿与远端内容，由用户明确决定下一次保存。
- 保留旧 settings 地址为兼容入口，打开相同抽屉并回到明确的工作空间页面；设置不作为可恢复页签。现规范的旧任务默认落地描述与已实现 daily-workbench 冲突，本次按当前工作概览事实校准同一导航要求，不重建历史变更。

## Risks / Trade-offs

- 从卡片写错工作空间 → GET/PUT 始终带卡片 ID，测试跨空间名称修改。
- 版本冲突后覆盖输入 → 保留输入，只显式采用新的观察版本。
- 侧栏入口取消影响旧链接 → 保留旧路由兼容，不删底层能力。

## Migration Plan

不迁移数据，旧设置深链接继续可用。仅移除设置页签恢复项。
