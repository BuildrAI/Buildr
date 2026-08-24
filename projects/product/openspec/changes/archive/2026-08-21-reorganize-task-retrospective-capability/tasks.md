## 1. Task Retrospective 模块边界

- [x] 1.1 将 Domain、Application、Repository 和 prompt 常量迁入 `src/task` 的 flat-first 技术层并修正 imports
- [x] 1.2 将 wrapper/runner 收敛为可导入且可直接执行的 `task/interfaces/internal/task-retrospective-driver.mjs`
- [x] 1.3 新增 Task Retrospective HTTP adapter，并在 `src/task/module.mjs` 声明 required/provided capabilities、兼容端口与 HTTP/runner 入口

## 2. Bootstrap 与旧入口退出

- [x] 2.1 按 Task Record → Task Retrospective 依赖顺序安装 module，并让 runtime compatibility methods 只来自模块端口
- [x] 2.2 从 legacy runtime、全局 Task persistence、HTTP Host 和公共 internal router 删除直接注册、硬编码路由与旧路径依赖
- [x] 2.3 更新 Application Payload/static validation、Verification owner 与全部消费者，使新路径完整覆盖且旧入口不存在

## 3. 行为等价与架构验证

- [x] 3.1 更新 module snapshot、dependency、contribution 唯一性、Host 边界和旧路径退出 contract tests
- [x] 3.2 更新 Task Retrospective Domain、Repository、Application、internal driver、HTTP、public JSON 和 package installed-layout tests
- [x] 3.3 运行 typecheck、架构、Task Retrospective unit/integration/system、HTTP、Application Payload 与 package affected tests并修复本变更引入的问题

## 4. 当前知识与收敛准备

- [x] 4.1 更新 Change Brief 与 current knowledge impact evidence，确认架构文档无需重复维护或只做必要同步
- [x] 4.2 完成 strict OpenSpec 校验、Convergence preflight 与最终 archive readiness 检查
