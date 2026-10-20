## 1. 查询客户端与数据读取

- [x] 1.1 核对并补齐 `features/mysql-query` 的查询客户端类型，使表读取沿用连接观察版本和取消信号；运行前端类型检查确认无类型错误。
- [x] 1.2 为表读取补充客户端层测试，覆盖请求地址、版本参数和失败传递；运行相关逻辑测试通过。

## 2. 左侧库表浏览

- [x] 2.1 重构 `DatabaseResources`：数据库行只展开/收起，复用编辑器已有的 `DatabaseCatalog` 按需读取表；提供局部加载、空表、错误与重试状态；运行组件逻辑测试通过。
- [x] 2.2 在 `MySqlQuery` 中接入共享表目录，移除左侧与当前数据库选择的联动；刷新数据库列表、切换连接或连接版本变化时清理库表状态；运行类型检查确认调用方完整。
- [x] 2.3 调整库表浏览样式，保持窄栏、单行省略、完整名称可查看，并保留现有启用数据库浮层样式；浏览器检查窄栏与长名称表现。

## 3. 自动化验证

- [x] 3.1 扩充 `mysql-database-resources.test.mjs`：展开显示表、展开不触发当前库、缓存不重复读取、失败重试、刷新/目标变化清理；运行该测试通过。
- [x] 3.2 运行 `services/buildr-web` 的逻辑测试与正式构建，确认现有查询编辑、偏好、结果隔离测试保持通过。
- [x] 3.3 更新 `test/browser-smoke/connection-skills.ts` 的离线查询夹具：提供表发现响应，断言展开库表不写偏好、当前库只由顶部选择切换，并保留原有刷新、禁用当前库和查询断言。

## 4. 浏览器验收

- [x] 4.1 使用 Buildr Web 开发预览的离线查询夹具，验证展开数据库显示表、当前库不变、查询仍使用顶部所选库、表读取失败局部提示与重试；如提供真实 MySQL 连接文件，再补充真实表发现检查。

## 5. 当前知识与规范

- [x] 5.1 按 `current-knowledge-maintenance` 的 `assess` 结论核对 `knowledge/docs/architecture/external-connections.md`、`knowledge/code-map/technical-layers.md` 与相关术语：外部连接中的“结构浏览”仍成立；前端代码地图已补充库表浏览及与当前数据库解耦的职责，术语无需调整。
- [x] 5.2 实现完成后确认 OpenSpec delta 与真实行为一致，运行 `openspec validate refine-mysql-query-schema-browser --strict` 与收敛预检通过。
