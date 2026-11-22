## 1. Harness 本机工作空间内置解析

- [x] 1.1 在 `services/buildr-harness/src/application/local-workspaces.ts` 实现零依赖的 `LocalWorkspaceAuthority`，读取同数据域 `workspace-registry.json`（含受限预览共享登记）、`.buildr/workspace.yml` / 旧版 `skills/manifest.yml` 及 `@default`，并按 `sha256([ref, rootPath, info.ino, info.birthtimeMs])` 校验目录身份与冲突；通过集成测试覆盖多行标量、引号、`identity_conflict` 与目录替换拒绝。
- [x] 1.2 在 `services/buildr-harness/src/application/directory-host.ts`、`src/process/host-channel.ts` 与 `src/process/server.ts` 接入 `LocalWorkspaceAuthority`：支持 Development 离线时 `/scope-catalog` 返回内置本地工作空间（`builtin`）、`/directory-workbench` 解析目录与名称、本地目录登记命中已登记工作空间时复用原身份及保留外部未知范围 `agent_host_unavailable` 拒绝语义；通过 `directory-host.test.ts` 与 `directory-workbench.test.ts` 验证。

## 2. Harness 网页作用域键对齐

- [x] 2.1 在 `services/buildr-harness-web/src/workspace-scopes.ts` 与 `src/HarnessApp.tsx` 导出并使用 `canonicalScopeKey`，正确映射 `sourceId === 'buildr'` 裸 ID 与 `scope:` 键，并在刷新及重复登记目录后维持正确的默认工作空间与工作区绑定；通过 `workspace-scopes.test.mjs` 与相关测试验证。

## 3. Development 宿主保活重连与 Harness 恢复轻量化

- [x] 3.1 在 `services/buildr/src/modules/agent-service/module.ts` 将 `AGENT_SERVICE_APPLICATION.start()` 接通幂等的 `maintainHostConnection()` 定时器重连循环，使 `onReady` 首次失败或 Harness 换代后能自动重连恢复；在 `agent-service-http.test.ts` 新增经 `start()` 路径的自动重连集成测试并验证通过。
- [x] 3.2 在 `services/buildr-harness/src/persistence/conversation-repository.ts` 新增轻量索引查询 `listInterruptedRefs()`，优化 `services/buildr-harness/src/application/conversation-application.ts` 中 `recoverInterrupted()` 的同步水合并分批让出事件循环，同时在 `src/process/client.ts` 将 `/host/attach` 超时放宽至 10 秒；通过静态检查及进程/对话集成测试验证。

## 4. 当前认知更新与直接验证

- [x] 4.1 同步更新 `knowledge/docs/architecture/harness-products.md`、`knowledge/code-map/harness-products.md` 与 `knowledge/index.yml`，准确反映本机已登记工作空间与默认工作空间可在 Harness 内置独立解析，同时工程对象核验与任务/项目/知识归属留在 Development。
- [x] 4.2 构建受影响包（`buildr-harness-web`、`buildr-harness`）并运行静态检查（`test:static`）、全量单元测试（`test`）及覆盖 `harness-protocol`、`harness-product`、`ownership`、`directory-host`、`directory-workbench`、`agent-service-http` 的集成测试，确认全部通过。
