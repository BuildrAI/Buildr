# 任务预览与工作树材料可读性修复

## 一句话摘要

修复 `web preview start --task` 的运行时缺口与工作树证据身份归一，让任务预览能启动并让 `task-worktree-candidate` 材料在预览中可读。

## 背景与问题

任务详情按受管工作树证据读取 `task-worktree-candidate` 材料。实测 `web preview start --task` 直接抛 `runtime.assertCanonicalTaskWorkspace is not a function`：web 模块从未接到任务查询与工作树 provider 端口。同时 provider 用传入路径直接比对 evidence `workspaceRoot`，当预览以工作树根为服务目标时身份不匹配，材料读取报"任务工作树当前不可读取"。最后，工作树 `.buildr/local/` 是空现场，预览进程读不到任务记录。

## 目标与非目标

目标：`--task` 预览可启动、可停止；canonical 与工作树目标得到一致证据解析；预览内任务记录可读且材料来源如实标注。非目标：新增 CLI/HTTP 端点、改变证据 schema、允许主目录旧文件冒充工作树材料、做数据实时同步。

## 受影响角色

- 用任务预览验收工作树成果的 agent 与维护者。
- 依赖 task-scoped 材料接口的 Buildr Web 任务详情页。

## 核心流程

`web preview start --task` → web 模块经 task query + worktree provider 端口解析任务工作树 → provider 把 linked worktree 目标归一到 canonical 证据身份 → 目标工作树缺本地任务库时以 canonical 库播种一致副本 → 预览服务按同一证据身份读取工作树材料并标识 `task-worktree-candidate`。

## 关键变化

- web 模块组合接入 `task.query-application` 与 `task-worktree.provider` 端口。
- provider 证据解析前归一 linked worktree 目标到 canonical checkout 身份。
- `--task` 预览在服务目标缺失本地库时播种一致 SQLite 副本，存在时复用不覆盖。
- 启动结果如实表达任务库来源（`canonical` 播种或 `existing` 复用）。

## 影响、风险与兼容性

不改变证据 schema、命令面或 retained/canonical 边界；副本为时点快照并如实标注，不回写 canonical。归一只影响证据解析层，原 fail-closed 诊断（证据损坏、checkout 漂移）保持不变。

## 验收摘要

`--task` 对 canonical 与工作树目标启动解析一致；工作树缺库时播种、有库时复用；预览内任务详情读工作树材料且 provenance 正确；不再出现 `is not a function` 或误报"任务工作树当前不可读取"。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [worktree-buildr-web-preview delta](specs/worktree-buildr-web-preview/spec.md)
- [task-environments delta](specs/task-environments/spec.md)
- [buildr-web-client delta](specs/buildr-web-client/spec.md)
- [tasks.md](tasks.md)
