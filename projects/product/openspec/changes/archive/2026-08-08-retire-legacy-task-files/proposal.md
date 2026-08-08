## Why

Task Record、Development、Review、Verification 与 Environment 的 current authority 已全部收敛到 Workspace SQLite，但 Buildr 仍保留 `.buildr/tasks/` 的一次性导入、忽略规则和“旧文件不得删除”契约，导致已退出运行时的数据继续占据产品边界并让维护者误以为目录仍有 authority。现在需要完成最终清退，使 SQLite 单一 authority 与文件系统行为一致。

## What Changes

- **BREAKING**：停止从 `.buildr/tasks/<task-id>/` 导入、读取或保留任何 Task lifecycle 文件；旧 `task.yml`、`development.yml`、`verification.yml`、`reviews/*.yml` 与 `environment.json` 不再是兼容输入。
- 删除两条已完成的一次性 Task Environment migration（旧 v1 receipt migration 与 `environment.json` current importer）及 sync 对旧 environment authority 的扫描依赖。
- 删除本自举 Workspace 中已确认不再被消费的 `.buildr/tasks/` 历史文件；产品不新增第二套清理状态、数据库表或通用文件清理框架。
- 修正 Task Environment capability contract、Skills、CLI/架构说明与测试，使所有公开入口只指向 Workspace SQLite。
- 保留 `/.buildr/tasks/` ignore 规则作为升级兼容护栏，避免旧 Workspace 的本机遗留内容意外进入 Git；该规则不创建目录，也不赋予旧文件 authority。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：移除 `environment.json` 一次性迁移和保留契约，Environment current 只存在于 SQLite。
- `workspace-structured-data-store`：删除 Task current file-store legacy input 边界，只保留 SQLite current tables。
- `buildr-package-assets`：产品验证退出一次性 Environment migration fixtures，只保护当前 SQLite authority 与 cleanup 行为。

## Impact

- 影响旧 Task Environment migrations、Workspace sync、Task lifecycle capability contracts、Skills、CLI 与架构文档。
- 删除 `.buildr/tasks/` 下当前 Git 已跟踪的历史 YAML；本机 ignored `environment.json` 在 retained Workspace 的最终受控清理中移除。
- 不改变 Workspace SQLite schema、Task Domain、Task lifecycle Application API、Local App read model、Git worktree evidence 或 Task Finish authority。
