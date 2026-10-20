## Why

当前创建服务（Service）且未显式选择代码目录时，Buildr 会在工作空间根物化 `services/<code>/` 并写入模板 `AGENTS.md`。该文件只含服务名、代码库实例（Repository Instance）标识和一句通用指引，相对 `services/manifest.yml` 没有增量信息，也不是规则的真实来源；用户确认现阶段没有服务级规则需要承载，空壳目录在文件树中形成噪音。

## What Changes

- **BREAKING**：新建服务且未显式选择代码目录时，不再创建 `services/<code>/` 目录及模板 `AGENTS.md`；服务登记只写入 `services/manifest.yml`。
- `directoryMode: 'create'` 的项目内服务目录继续按声明创建，但不再写入模板 `AGENTS.md`。
- 服务文档读取保持 `services/<code>` 优先、代码库模块目录兜底的顺序：人工放置的 `AGENTS.md`/`README.md` 仍会被读取，兼容性不变。
- 已存在于工作空间的 `services/<code>/` 目录不受影响，不主动清理。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `service-asset-indexing`: 移除"共享服务默认目录 MUST 使用 `services/<code>`"的承诺；服务规则入口约定保持按实际存在的 `AGENTS.md` 发现。

## Impact

- 实现：`services/buildr` 中 `asset-relationships-application.ts` 的 `mutate()` 目录检查、文件清单与服务目录写入。
- 测试：`test/integration/asset-relationships.test.ts` 中依赖模板 `AGENTS.md` 的断言。
- 兼容：删除服务仍保留全部物理内容；既有工作空间的空壳目录保留，文件树外观仅在新建服务后变化。
- 无 API、清单 schema 或数据迁移变化。
