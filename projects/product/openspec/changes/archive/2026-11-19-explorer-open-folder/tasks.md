## 1. 后端与 HTTP 契约

- [x] 在代码文件应用层实现 `openFolder`，严格校验 `code` 与 `project` 当前文件真实路径与检出/来源身份并调用 `openDirectory`
- [x] 在 `code-http-contracts.ts` 与 `code-http.ts` 新增受本机会话授权的 `POST /code/open-folder` 接口并生成两端 HTTP DTO

## 2. 前端入口

- [x] 在 `codeApi`、`FileEditingPane` 与 `RepositoryFileBrowser` 增加打开所在文件夹交互与反馈
- [x] 接入 `CodeExplorerPage`、`ProjectDetailPage` 与 `SourceControlWorkbench` 完整当前文件视图并区分图标

## 3. 验证与文档

- [x] 补充后端集成测试与浏览器端到端测试并验证通过
