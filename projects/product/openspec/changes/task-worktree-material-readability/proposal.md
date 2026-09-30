# task-worktree-material-readability

## Why

`buildr web preview start <instance> --task <id>` 当前直接失败为 `runtime.assertCanonicalTaskWorkspace is not a function`——web 模块的预览运行时没有接上任务/工作树端口，属产品缺陷。同源缺陷还有一层：Git worktree provider 用传入根直接比对证据里的 `workspaceRoot`，当目标本身是 linked task worktree（预览服务以工作树为 `--target`）时身份不匹配，任务详情按 `task-worktree-candidate` provenance 读材料的链路退回"任务工作树当前不可读取"。此外，预览子进程以服务目标工作树为 workspace，但其 `.buildr/local/` 是隔离空现场，没有任务库副本就无法读取任务记录。

## What Changes

- web 模块组合接入既有 `task.query-application` 与 `task-worktree.provider` 端口，`web preview start/stop --task` 恢复可调用，不再抛 `is not a function`。
- Git worktree provider 在解析任务工作树证据前，把 linked worktree 目标归一到其 canonical checkout 身份；canonical 根与工作树根传入 `inspect`/证据读取得到一致结果。
- `web preview start --task` 在目标工作树的本地结构化存储缺失时，从 canonical workspace 播种一份一致的 `workspace.sqlite` 副本；已存在时复用不覆盖，播种与复用都在结果中如实表达。
- `buildr-web-client` 的"任务材料必须读取任务的实际文件现场"要求补充明确：以任务工作树为服务目标时材料解析不得退回保留目录冒充。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `worktree-buildr-web-preview`：`--task` 预览的 workspace/worktree 解析契约与任务数据可读性（播种副本）约束。
- `task-environments`：Git worktree provider 对 linked worktree 目标的证据身份解析要求。
- `buildr-web-client`：任务材料按工作树证据选择实际文件现场的要求在服务目标为工作树时的明确表达。

## Impact

- `services/buildr/src/web/module.ts`（依赖与组合端口）、`src/web/application/preview-lifecycle.ts`（数据播种与解析）、`src/modules/task/infrastructure/git-worktree-provider.ts`（canonical 归一）。
- 测试：worktree provider、`web preview --task` 集成与 change-application 材料读取场景。
- 不新增 CLI 子命令或 HTTP 端点；`--task` 语义不变，仅恢复可用并补齐数据可读性。
