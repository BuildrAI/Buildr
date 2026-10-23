## Why

Buildr Web 本机工作空间登记列表（Workspace Registry）当前只按 Web Profile 的 dataRoot 区分，导致两条缺陷：

- 任何未设置 `BUILDR_APP_DATA_DIR` 隔离的进程——例如临时验收脚本、`buildr init`/`buildr web --target` 指向临时目录——都会把一次性夹具工作空间写进 `Buildr Dev` 的真实登记列表，用户页面出现残留测试工作空间。
- `buildr web preview` 启动的预览实例虽有独立数据目录与登记列表，但看不到开发版主实例已登记的工作空间，跨工作空间的场景在预览里不可达。

需要让"共享登记列表"只接受长期真实工作空间，同时让预览实例在保有自己登记空间的前提下仍能看到主实例已登记的工作空间。

## What Changes

- 共享 Profile 登记列表（未隔离 `BUILDR_APP_DATA_DIR` 的实例，含开发版与发布版主实例）拒绝登记临时根：系统临时目录下的路径与任务工作树（Worktree）检出路径；隔离数据根（预览、测试与显式覆盖）不受影响。
- Task/standalone 预览实例的 Workspace 登记查询返回共享 Profile 登记列表与本预览登记列表的合并结果；共享条目只读，预览内的移除只作用于本预览登记列表。
- 移除语义保持原有 revision 校验；预览中尝试移除仅存在于共享列表的工作空间返回明确诊断而非"未登记"。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-workspace-application`: 共享 Profile 登记入口拒绝临时根；预览实例的登记列表查询合并共享条目并标注来源。
- `worktree-buildr-web-preview`: 预览实例在保留独立登记列表的前提下可见共享登记条目。

## Impact

- `projects/product/services/buildr/src/modules/workspace/persistence/workspace-registry-repository.ts`：新增共享登记文件解析与隔离判定。
- `projects/product/services/buildr/src/modules/workspace/application/workspace-command-application.ts`：登记入口的临时根拒绝与预览移除诊断。
- `projects/product/services/buildr/src/modules/workspace/application/workspace-query-application.ts`：预览上下文的登记列表合并与解析。
- `projects/product/services/buildr/src/modules/workspace/module.ts`：预览上下文装配。
- 不改动 `workspace-registry.json` 文件格式、HTTP 路由形状或既有登记 API 字段；只新增错误码与可选条目字段。
- 测试：`workspace-command-application`/`workspace-query-application` 相关单元或契约测试补充覆盖。
