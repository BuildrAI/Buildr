## Context

问题动机和能力范围见 [proposal.md](proposal.md)。当前系统中：
- Harness 通过 `AgentHostRegistry` 将 `sourceId='buildr'` 的范围发现和目录解析全部路由到 Buildr Development 的 HTTP 回调端口；仅有 `@default` 存在零散回退且还受 `BUILDR_APP_DATA_DIR` 环境变量差异影响。
- `buildr` 服务启动时仅调用 `AGENT_SERVICE_APPLICATION.start()`，并未触发挂载在模块 `lifecycle.start` 上的 `maintainHostConnection()`；而 Harness 换代启动时 `recoverInterrupted()` 同步水合全量活跃对话并全表扫描 `conversations.sqlite`，易阻塞事件循环超过 3 秒导致 `/host/attach` 超时失联。

## Goals / Non-Goals

**Goals:**
- 在不改变产品包依赖方向的前提下（`buildr-harness` 不导入 `buildr`），让 Harness 原生内置解析同一数据域的本机已登记工作空间和 `@default`，使其在 Development 离线或未启动时完整可用。
- 保持 `buildr` 在线时工程能力（任务核验 `verifyWorkObject`、参与观察 `observeParticipation`、实时名称/状态）正常提供，并与内置解析在文件系统摘要上完全兼容。
- 消除 Development 宿主注册失效与 Harness 启动恢复阻塞事件循环的两处工程缺陷。

**Non-Goals:**
- 不将任务、Project/Service/Repository 登记或知识维护迁入 Harness。
- 不为 `buildr-harness` 新增 YAML 解析第三方 npm 运行依赖。
- 不向外部宿主来源或非本地登记的未知范围开放本地目录回退。

## Decisions

### D1. Harness 独立实现零依赖的本机工作空间读取器（LocalWorkspaceAuthority）
- **决策**：在 `services/buildr-harness/src/application/local-workspaces.ts` 新增 `LocalWorkspaceAuthority`，只依赖 Node 内置模块（`fs`、`path`、`crypto`），按与 Development 一致的文件布局读取 `<dataRoot>/workspace-registry.json`（含隔离预览合法共享登记）和各根目录的 `.buildr/workspace.yml`（及旧版 `skills/manifest.yml` 的 `workspaceId`）。
- **理由**：`buildr-harness` 应保持产品独立性，不能反向依赖 `buildr` 或为此新增 npm 包依赖；而 `.buildr/workspace.yml` 仅使用顶层标量字段（`schemaVersion`、`id`、`name`、`workspaceId`），用严格的顶层 YAML 标量解析器即可准确读取单双引号、转义与纯文本标量，并安全跳过多行块标量（如 `description: |-`）和缩进子结构。
- **替代方案**：由 `buildr` 在连接时把工作空间列表缓存一份到 `agent-service/` 私有文件。放弃该方案：缓存文件在用户仅用 `buildr init` 登记新工作空间后不开 `buildr web` 就会过时，且违背 `workspace-registry.json` 作为单机唯一工作空间清单的权威性。

### D2. 保持与 Development 完全一致的目录身份摘要及冲突保护
- **决策**：`LocalWorkspaceAuthority.resolveExecutionScope` 使用与 `services/buildr/src/modules/agent-service/module.ts` 完全相同的摘要公式 `sha256(JSON.stringify([{ sourceId: 'buildr', id }, rootPath, info.ino, info.birthtimeMs]))`，继续检测 `identity_conflict`（双文件 ID 不一致或同 ID 多目录冲突）、目录缺失、权限不足及链接替换；对 `@default`，若 `<dataRoot>/default-workspace` 已存在（兼容开发版 `BUILDR_APP_DATA_DIR` 历史）则优先对齐该目录，否则沿用 `defaultHarnessWorkspaceRoot(dataRoot)`。
- **替代方案**：对内置 `buildr` 工作空间使用另一套修订格式。放弃该方案：会导致 `buildr` 在线与离线切换时触发无意义的 `agent_scope_binding_changed`，阻断正在进行的对话续发。

### D3. 解析优先级与目录去重边界
- **决策**：
  - `AgentHostRegistry` 对非 `harness-local` 来源先尝试实时在线宿主回调；仅当 `sourceId === 'buildr'` 且无可用实时连接（或 `peers` 均不可达）时，交由 `LocalWorkspaceAuthority` 解析。不在 `workspace-registry.json` 中的未知 `buildr` ID 仍返回未解析并抛出 `agent_host_unavailable`，保留严格白名单保护。
  - `/scope-catalog` 合并 `LocalWorkspaceAuthority.listRegistered()`、在线宿主发现和仓库历史范围；当某 `buildr` 范围可由 `LocalWorkspaceAuthority` 解析且当前无在线 `buildr` 宿主时，其 `authority` 标记为 `'builtin'`（有在线宿主时仍为 `'registered'`）。
  - `/directory-workbench` 取消“非 `harness-local` 必须存在活跃宿主回调”的硬拒绝，转由 `hosts.resolveExecutionScope` 统一判定。
  - `HarnessDirectoryHost.register` 在新建 `harness-local` 前先查询 `LocalWorkspaceAuthority.findBySelectedPath`，命中已登记本地工作空间时直接复用其原身份，名称不一致时按 `agent_directory_already_registered` 拒绝；前端 `HarnessApp` 使用 `canonicalScopeKey` 将 `sourceId === 'buildr'` 映射为原裸标识，并在加载后保持合理默认选中工作空间。
- **替代方案**：将所有 `buildr` 对话迁移成 `harness-local`。放弃该方案：会破坏 Development 中已有任务关联和工程身份一致性。

### D4. Development 启动保活接通与 Harness 恢复轻量化
- **决策**：
  - 在 `services/buildr/src/modules/agent-service/module.ts` 让 `AGENT_SERVICE_APPLICATION.start()` 与模块 `lifecycle.start` 共用同一幂等的 `maintainHostConnection()` 保活/指数退避重连循环；`start()` 仍等待首次连接并向 `onReady` 抛出首轮失败诊断，但同时保证已排入 1 秒后台重试且不重复建定时器。
  - 在 `services/buildr-harness/src/persistence/conversation-repository.ts` 增加轻量只读查询 `listInterruptedRefs()`，利用 `conversation_read_states` 避免对大库做全表 `json_extract`；在 `conversation-application.ts` 的 `recoverInterrupted()` 中优先用 `listPendingStates(true)` 过滤需要补齐的记录、按批次让出事件循环，并将 `client.ts` 中 `/host/attach` 的超时从 3 秒放宽至 10 秒。

## Risks / Trade-offs

- **YAML 解析边缘语法** → 仅针对本机已知声明的顶层标量键解析，完整覆盖单引号、双引号、转义、行尾注释与跳过多行/嵌套块；若未来 `.buildr/workspace.yml` 出现无法从顶层标量识别的结构，仍可由在线 Development 宿主提供准确信息，同时以单元测试覆盖常见格式与冲突场景。
- **独立打开本机未知 `buildr` ID（未在本机 `workspace-registry.json` 登记）** → 坚持 fail-closed 返回 `agent_host_unavailable`，不从对话历史 `cwd` 反推，避免绕过本地工作空间登记边界。
- **`buildr` 在线与离线瞬间切换的宿主能力差异** → 仅工作对象核验（`verifyWorkObject`）和参与观察在离线时不可用，通用对话、文件浏览和本地 Git 工作台不受影响。
