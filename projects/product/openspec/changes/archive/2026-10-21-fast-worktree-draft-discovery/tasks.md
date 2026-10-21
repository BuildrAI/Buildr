# Tasks: fast-worktree-draft-discovery

## 1. Provider 轻量证据枚举

- [x] 1.1 在 `src/modules/task/infrastructure/git-worktree-provider.ts` 增加文件系统证据枚举 `listGitWorktreeEvidence(root)`：`.git` 目录/文件解析 common dir（worktree 读 `gitdir`/`commondir` 文件），workspace 锚点归一、按登记来源（含 service 来源）收集全部 `buildr/task-worktrees/*.json`，复用 `validateEvidence` 与 taskId 冲突语义，全程零 git 子进程。验证：新增/扩展集成测试在含 worktree 证据的 fixture 上枚举出证据，且不会调用 git。
- [x] 1.2 把 `listGitWorktreeEvidence` 加入 `src/modules/task/module.ts` 的 provider `pick` 列表，作为 `TASK_WORKTREE_PROVIDER` 成员暴露。验证：`tsc` 类型检查通过，依赖该 port 的模块可解析。

## 2. 读者切换到轻量发现

- [x] 2.1 重写 `publication-worktree-reader.ts` 的 `list()`：用 `listGitWorktreeEvidence` 替代 `gitWorktreeEvidenceDirectories`+逐任务 `taskScope()`；按证据 selector（`project:`/`workspace:`/`service:` 回退语义与 `resolveTaskProjectDocument` 一致）定位项目 publications 目录。验证：`test/integration/publication-worktree.test.ts` 全部通过，工作树草稿仍带 sourceTask 返回。
- [x] 2.2 实现文件系统身份探针（检出目录 `.git` 为 linked-worktree 文件、`gitdir` 归属记录的 common dir、`HEAD` 指向记录分支）；失败只跳过该来源并产生局部诊断，不回退主目录稿件。验证：覆盖"登记后被改名/换分支"场景的测试产出诊断且不落回保留仓稿件。
- [x] 2.3 `detail`/`asset`/`resolve`/`find` 维持 `taskScope()` 完整核对不变；unchanged 基线去重与同 id 多任务区分不变。验证：现有 detail/编辑相关测试通过，新增测试确认 list 路径不触发 `inspectGitWorktrees`。

## 3. 验证与实测

- [x] 3.1 运行 services/buildr 适用的单元/集成测试与类型检查。验证：按 `verification.yml` 适用检查通过。
- [x] 3.2 用开发实例实测 jixian workspace `GET /api/v1/publications`，记录改前/改后耗时与返回条目。验证：草稿行为不变（sourceTask 完整、无重复、无回退），列表耗时有数量级下降。
- [x] 3.3 核对 `knowledge/code-map/task-system.md` 中 git-worktree-provider 与 materials 的描述是否仍准确；若有失真说明影响并在授权范围内校准。验证：代码地图相关条目经复核标注 aligned 或已更新。
