## Why

Task current records 已收敛到 Workspace SQLite，`.buildr/tasks/` 只继续承载 Task Environment Receipt 和不再读取的旧 YAML，但默认 `.gitignore` 仍只精确忽略 `environment.json`。这会让 inert legacy records 或未来误写文件重新暴露为可提交内容，需要把整个 Task 本机目录统一排除。

## What Changes

- 默认 Workspace baseline 改为忽略整个 `/.buildr/tasks/`，不再只忽略 `/.buildr/tasks/*/environment.json`。
- `buildr init` 为新 Workspace 写入整目录规则；`buildr sync` 为已有 Workspace 幂等补齐整目录规则。
- 已有的精确 `environment.json` 规则可以继续保留，sync 不删除用户 `.gitignore` 内容，也不自动取消已跟踪旧 YAML。
- 增加 package、初始化和同步验证，证明整目录规则存在且重复执行不产生重复条目。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-environments`：Environment Receipt 所在的整个 `.buildr/tasks/` 目录必须作为 Workspace 本机状态被根 `.gitignore` 排除。
- `buildr-package-assets`：默认 package baseline、`init` 与 `sync` 必须一致交付并补齐 `/.buildr/tasks/`，且不得借此删除用户规则或自动改变已跟踪旧记录。

## Impact

- 影响 `package/targets/workspace/gitignore`、Workspace 初始化与 package sync 的 `.gitignore` 收敛实现。
- 影响相关 contract、package workspace 和初始化/同步测试。
- 不改变 Task Store、Environment Receipt path、Git tracking 历史或用户手工维护的其他 `.gitignore` 内容。
