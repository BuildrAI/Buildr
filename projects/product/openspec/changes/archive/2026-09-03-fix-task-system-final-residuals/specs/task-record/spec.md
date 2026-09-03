## ADDED Requirements

### Requirement: Task Record 读取必须隔离外部引用可用性
只要 SQLite 中 Task Record 自身结构有效，inspect、list、Buildr Web detail 与专业模块读取 MUST返回完整顶层记录。Project、Service 或 Change 当前不存在、已迁移或暂时不可解析时，Application MUST返回响应级局部 `referenceDiagnostics`，不得写回记录、删除/隐藏引用或建立统一健康状态。

#### Scenario: Project 或 Service 不可用
- **WHEN** 历史 Task 引用当前 registry 中不存在的 Project 或 Service
- **THEN** inspect、list 与 Web detail MUST返回同一 Task Record、关系、状态和结果
- **AND** MUST只为不可用引用返回带 kind 与 identity 的局部诊断

#### Scenario: Change 不可解析
- **WHEN** stored Change 当前在 retained Workspace 与 matching Worktree 均不可解析
- **THEN** Task Record MUST保持可读并返回 Change 局部诊断
- **AND** 只有真正打开或依赖该 Change 的动作 MUST失败

#### Scenario: 新增不存在引用
- **WHEN** create 或 update 新增当前不存在的 Project、Service 或 Change
- **THEN** Application MUST拒绝整个 mutation 并保持 Task Record 不变

#### Scenario: 删除失效引用或更新无关字段
- **WHEN** caller 提供当前 record digest 删除失效引用，或只修改 title/intent 等无关字段
- **THEN** mutation MUST不因保留的旧引用当前不可用而失败
- **AND** 写后响应 MUST重新计算剩余引用的局部诊断

## MODIFIED Requirements

### Requirement: Buildr Web Task 列表必须支持 open 与封闭 SQLite 过滤
Task query projection MUST支持关键词、Project、Service、`open|todo|active|completed|abandoned|all` status、是否有直接 Child 与复盘文档 `missing|pending-decision|decided|all` 的参数化过滤。关键词 MUST对 title 与 intent 使用 OR，与其他条件使用 AND；空白关键词 MUST等同未过滤，SQL wildcard 与注入输入 MUST按普通文本安全处理。Application/repository 未传 status 时 MUST保持 `all` 兼容语义，Buildr Web 首次进入和清除页面筛选 MUST显式使用 `open`。

#### Scenario: 组合过滤
- **WHEN** 调用方同时提供关键词、Project、Service、status、hasChildren 与 retrospectiveState
- **THEN** repository MUST使用参数绑定按 AND 组合不同过滤维度，并在 title/intent 之间使用 OR
- **AND** `status=open` MUST只匹配 todo 与 active

#### Scenario: Buildr Web 默认 open
- **WHEN** 用户首次进入 Task 列表且未在页面选择其他状态
- **THEN** Web feature MUST显式请求 `status=open`
- **AND** Application/repository 在未传 status 时 MUST保持返回全部 Task 的兼容语义

#### Scenario: 复盘筛选查看终态
- **WHEN** 用户选择 `pending-decision` 或 `decided` 复盘筛选
- **THEN** Web MUST自动把页面状态筛选切换为 `all`
- **AND** 用户仍 MUST可主动选择其他合法 status

#### Scenario: Project 与 Service 选项
- **WHEN** 页面生成 Project/Service 下拉选项
- **THEN** Application MUST从 Task SQLite scope rows 读取 distinct identities，选择 Project 后页面 MUST只展示该 Project 的 Service
- **AND** MUST不为过滤选项读取 Project/Service filesystem registry

#### Scenario: 搜索请求发生竞态
- **WHEN** 新筛选请求在旧请求完成前发出
- **THEN** 页面 MUST显示明确 loading，并 MUST防止旧响应覆盖新条件结果
- **AND** 空结果 MUST区分 Workspace 没有 Task 与当前筛选无结果
