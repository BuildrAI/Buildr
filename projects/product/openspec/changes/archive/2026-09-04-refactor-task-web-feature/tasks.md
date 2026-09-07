## 1. Feature与Client命名

- [x] 1.1 将Task前端迁移到`features/task`并更新路由和测试引用
- [x] 1.2 将内部Client统一为`task-api.ts`与`taskApi`，更新generated DTO目标路径

## 2. 页面状态拆分

- [x] 2.1 让`useTaskDetail`管理Workspace和Task详情读取
- [x] 2.2 新增`useTaskActions`管理编辑、完成、放弃及其草稿和错误
- [x] 2.3 新增`useTaskArtifacts`管理Brief、原型和项目文档
- [x] 2.4 收敛Evidence与复盘读取并移除`any`和伪Hook
- [x] 2.5 收瘦`TaskDetailPage`并保持DOM、路由和交互不变

## 3. 当前认知与验证

- [x] 3.1 更新Buildr Web Service说明及相关流程路径
- [x] 3.2 更新架构、生成契约和浏览器选择器测试
- [x] 3.3 运行DTO生成检查、TypeScript构建、前端测试和相关Buildr测试
