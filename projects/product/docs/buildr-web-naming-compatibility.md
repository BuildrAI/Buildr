# Buildr Web 命名兼容清单

本清单记录本次公开命名收敛中明确不做机械迁移的内部/兼容身份。旧的
`projects/product/openspec/changes/archive/**` 历史正文不在本次变更范围内。

| 类别 | 保留的旧身份 | 当前处理 | 约束 |
| --- | --- | --- | --- |
| HTTP schema | `buildr.local-app-instance/v1`、`buildr.local-app-health/v1`、`buildr.local-app-preview/v1` | wire/schema reader 保留 | 不改 schema URI，不新增平行 major |
| Preview provider | `local-app-preview`、`BUILDR_LOCAL_APP_PREVIEW` | provider/env reader 保留；公开 label 使用 Buildr Web Preview | 仅在协议边界出现 |
| Environment/CLI fields | `BUILDR_APP_*`、`BUILDR_LOCAL_APP_PREVIEW` | 保留环境变量和旧结果字段读取 | 不把环境变量当公开产品名 |
| SQLite/persistent identity | `localApp*` 表达、历史实例/Delivery identity | 保留持久化读写和旧 terminal reader | 不改数据库 schema 或历史 identity |
| Publication | 旧 `local-app` platform value | reader canonicalize 到 `buildr-web`；新输出写 canonical value | 未知值 fail closed |
| Bundle Identifier | `ai.buildr.local-app.dev` | 新构建使用 `ai.buildr.web.dev`；旧值作为 legacy ownership identity 记录 | 清理必须证明 Buildr ownership，不按名称盲删 |

当前源资产扫描白名单仅包含上述协议、环境、持久化和兼容 reader 标识；公开
页面、CLI、测试入口、verification ID、Skill phase、OpenSpec canonical spec
路径和文档不应继续使用旧公开命名。
