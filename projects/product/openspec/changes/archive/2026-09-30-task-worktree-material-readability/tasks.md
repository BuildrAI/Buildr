# Tasks

## 1. 修复 `web preview --task` 运行时缺口

- [x] 1.1 `src/web/module.ts`：`requires` 增加 `TASK_QUERY_APPLICATION` 与 `TASK_WORKTREE_PROVIDER`；组合对象接入 `assertCanonicalTaskWorkspace` 与 provider 端口（`inspectGitWorktrees`、`readGitWorktreeEvidence`、`gitWorktreeEvidencePath`）。
- [x] 1.2 更新模块装配/架构测试（如 `bootstrap-module-architecture`），覆盖 web 模块新依赖与端口存在性。
- [x] 1.3 `worktree provider` 归一：`git-worktree-provider.ts` 增加 canonical checkout 归一（linked worktree → canonical 身份），应用于 `readGitWorktreeEvidence`/`writeGitWorktreeEvidence`/`planGitWorktrees`/`inspectGitWorktrees`/`cleanupGitWorktrees` 的 workspaceRoot 判定；非 Git/无证据目标保持 `git_worktree_evidence_missing` 语义。
- [x] 1.4 `preview-lifecycle.ts`：`resolveTaskPreviewWorktree`/`assertPreviewStopOwner` 调用链对 canonical/linked 目标一致；`web preview stop --task` 同样可归一。

## 2. 任务预览数据播种

- [x] 2.1 `preview-lifecycle.ts`：`startPreview --task` 分支在目标工作树 `.buildr/local/workspace.sqlite` 缺失时，用 SQLite backup 语义（`VACUUM INTO` + 原子 rename）从 canonical workspace.sqlite 生成副本；存在则复用；canonical 缺失/损坏时抛 `preview_task_store_unavailable` 且不写空库。
- [x] 2.2 启动结果/owner 增加 `taskStore` 表达（`source`、`seeded`），CLI 与 `--json` 输出如实展示快照来源语义；`PreviewOwner` 兼容旧记录无该字段。

## 3. 测试与验证

- [x] 3.1 补充 provider 测试：linked worktree 目标执行 `inspect`/证据读取与 canonical 目标返回一致；非登记 Git 目录保持缺证据诊断。（`worktree-create.test.ts`：linked 目标 inspect ready 且仓库集合一致）
- [x] 3.2 补充 preview 集成测试：`--task` 播种写入工作树副本且不覆盖既有副本；canonical 库缺失时 fail closed。（`preview-ownership.test.ts`）
- [x] 3.3 真实链路冒烟：本任务工作树启动 `web preview start --task` + `--target` 分别指向 canonical 与 worktree，任务详情材料可读且 provenance 为 `task-worktree-candidate`。（两形态均通过：启动/材料读取/停止）

## 4. 核对

- [x] 4.1 `openspec validate task-worktree-material-readability --strict` 与 `buildr openspec convergence preflight` 通过。
- [x] 4.2 按 `verification.yml` 执行受影响 `buildr` 服务检查：test:fast 全绿、test:integration 558 项通过、system-buildr-web-http 与 system-app-process 套件通过。
- [x] 4.3 知识影响核对：已更新 `knowledge/code-map/task-system.md`（provider 归一、预览播种）与 `knowledge/docs/architecture/buildr-data-design.md`（工作树副本行）。
