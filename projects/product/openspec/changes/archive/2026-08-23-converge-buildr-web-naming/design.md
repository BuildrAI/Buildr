## Context

当前产品已经把本机浏览器界面定位为 Buildr Web，但代码、测试、Skill、验证声明和 OpenSpec 仍混用旧的 Local App/Buildr App 词汇。与此同时，`buildr.local-app-*` schema、`local-app-preview` provider、`BUILDR_LOCAL_APP_PREVIEW`、SQLite/persistent identity 和部分 publication 数据已经跨进程或跨版本使用，不能通过全局替换迁移。

本 Change 横跨 `buildr` Runtime/CLI 与 `buildr-web` Frontend Service，并覆盖当前源资产；`openspec/changes/archive/**` 是历史事实，不在迁移范围。

## Goals / Non-Goals

**Goals:**

- 让用户、维护者和验证入口只看到 Buildr Web 分层术语。
- 将公开命名、文件名、测试名、验证 ID、Skill 阶段名和当前 canonical OpenSpec 引用收敛。
- 为每个旧标识建立“迁移、保留、兼容读取或暂不迁移”的可审计决定。
- 保持 loopback/session/Origin、SQLite/Application authority、Task-scoped read、Browser serial capacity 和 Delivery 边界不变。

**Non-Goals:**

- 不改 `openspec/changes/archive/**` 历史记录。
- 不机械改名 `buildr.local-app-*`、`local-app-preview`、`BUILDR_LOCAL_APP_PREVIEW`、SQLite/persistent identity 或既有 payload 字段。
- 不在本 Change 重构前端布局、交互或业务流程；因此不需要 UI Prototype。
- 不改变运行时端口、数据目录隔离、权限模型、数据库 schema 或 Task 生命周期语义。

## Decisions

### 1. 分层术语作为唯一公开命名

代码注释、help、错误、日志说明、页面文案、测试标题、验证标题、Skill 文档和当前 canonical specs 使用：Buildr Web、Buildr Web Runtime、Buildr Web Frontend Service、Buildr Web Launcher、Buildr Web Preview。选择分层术语而不是单一 `Web`，因为它能保留 Runtime、Frontend 和 Launcher 的 authority 边界。

备选方案是全局替换为 `Web` 或继续使用 `Buildr Web`。前者丢失组件责任，后者与已经确定的产品定位冲突，因此不采用。

### 2. 已发布 wire/环境/持久化身份保持稳定

`buildr.local-app-*` schema/protocol、`local-app-preview` provider、`BUILDR_LOCAL_APP_PREVIEW` 以及 SQLite/persistent identity 保持原值；公开 label 改为 Buildr Web，reader 继续接受旧值，canonical writer 仅在已确认的 publication platform 字段使用 `buildr-web`。所有旧值兼容都由显式常量、registry 或 alias 表达，避免旧称重新进入产品 surface。

备选方案是同步重命名 schema、环境变量和数据库值。该方案会破坏旧进程、旧 receipt 和历史数据，且没有独立迁移窗口，不采用。

### 3. publication platform 采用新写入、旧读取

publication platform enum 的新写入值为 `buildr-web`；reader 接受 `buildr-web` 与旧 `local-app`，展示统一为 Buildr Web。无效值仍 fail closed。这样把产品命名迁移与历史发布数据兼容分开。

### 4. Bundle Identifier 做 ownership-aware 迁移

开发 Launcher 的 canonical Bundle Identifier 改为 Buildr Web 形式；启动、停止、清理和已有进程识别同时接受旧 `ai.buildr.local-app.dev`，仅清理由当前 Buildr Web Launcher 所拥有且能证明的旧实例。不能通过宽泛进程名或全机扫描删除未知进程。

### 5. 当前 canonical OpenSpec 文件名可迁移，归档文件名不可迁移

当前 `openspec/specs/` 中带 Buildr Web 的 capability 目录和引用统一为 Buildr Web 术语，Change delta 记录 requirement rename；`openspec/changes/archive/**` 只作为历史引用保留。实现完成后用排除 archive 的 inventory 检查残留，并对保留兼容标识逐项列出原因。

## Risks / Trade-offs

- [兼容标识被误改] → 建立保留清单、public JSON registry 回归和旧 payload reader 测试；禁止全局替换。
- [旧 publication 数据无法读取] → 新写入/旧读取双向测试，非法 enum 继续 fail closed。
- [旧 Bundle 实例被误杀] → 只处理可证明 ownership 的实例，并保留旧 identity 识别测试。
- [canonical spec 引用遗漏] → 完成后运行 OpenSpec strict validation、引用扫描和 Buildr Web/Browser affected verification。
- [并发任务造成基线漂移] → 所有修改只发生在当前 Task Environment，验证前重新检查 Git target identity；不操作其他任务 worktree。

## Migration Plan

1. 在当前 Task Environment 完成 Change artifacts、术语清单和兼容标识测试。
2. 先更新公开命名、当前 canonical spec 引用、验证 registry、Skill/docs 与前端 labels，再实现 publication alias 和 Bundle ownership 兼容。
3. 运行静态残留扫描、affected unit/system tests、web-dist 与 Browser smoke；确认 archive 未发生变化。
4. 若验证失败，回滚只涉及当前 Task 的候选提交；保留 wire/环境/持久化旧身份，避免数据迁移回滚风险。

## Open Questions

- 稳定发布版本是否需要另一个 Change 承担旧 Bundle Identifier 的长期清理窗口；本 Change 只实现安全识别与迁移基础。
- `local-app-*` capability 目录是否在本 Change 一并重命名，取决于 OpenSpec canonical 引用完整性扫描；不得为了命名洁净破坏历史链接。
