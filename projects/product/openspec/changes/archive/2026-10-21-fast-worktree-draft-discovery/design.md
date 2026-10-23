# Design: fast-worktree-draft-discovery

## Context

`GET /publications` 列表由两部分组成：保留仓扫描（实测 ~30ms，纯文件读）与工作树草稿合并（实测 ~1.7s/任务）。后者为"发现"付出全量 Git 核对：`gitWorktreeEvidenceDirectories` 对每个登记来源执行 `rev-parse`/`git-common-dir`（每仓约 2 个子进程），`inspectGitWorktrees` 再对每条证据执行 canonical 重规范化 + 完整证据目录重发现 + 每仓 14 次身份命令（含 `git status`）。jixian workspace（7 项目、25 仓、1 任务）单次列表约 169 次同步 `git` 进程、~2.5s，且 `spawnSync` 全程阻塞事件循环。

## Goals / Non-Goals

**Goals:**
- 列表发现路径零 `git` 子进程：证据枚举与草稿读取只用文件系统。
- 失效来源表现为局部诊断 + 跳过，不阻塞其他来源。
- 访问路径（detail/asset/update）语义与实现不变。

**Non-Goals:**
- 不改 `inspectGitWorktrees` / `assertCurrentCheckoutIdentity` 等核对实现本身。
- 不引入跨请求缓存、异步并发或响应结构变化。
- 不把服务仓证据扫描的 Git 精确性（如非标准 gitdir 布局）下沉到文件系统猜测——非常规布局按"未发现"处理，不冒充已核对。

## Decisions

### 1. Provider 新增轻量证据枚举：`listGitWorktreeEvidence(root)`

证据目录枚举与 JSON 解析是 `buildr.git-worktree-provider` 的职责（evidence 位于 Git common dir 的 `buildr/task-worktrees/`，schema 由 provider 持有）；读者不复制该约定。新增方法用文件系统完成现有 `discoverEvidenceDirectories` 的等价定位：

- common dir 解析：`<source>/.git` 为目录 → 即 common dir；为文件 → 读 `gitdir:` 指针，再读 `gitdir/commondir` 相对路径解析；无 `.git` → 向祖先（不越过 workspace root）找最近 `.git`。解析失败按无证据处理，不回退猜测。
- canonical workspace root：root 的 `.git` 为文件时，主检出 = `dirname(commonDir)`，与现有 `canonicalEvidenceWorkspaceRoot` 的 worktree 归一语义一致。
- 证据读取复用 `validateEvidence`（`workspaceRoot` 同一性、taskId、schema 校验不省）；同一 taskId 多份证据沿用现有 `git_worktree_evidence_conflict` 冲突语义，不静默选择。
- 返回 `{ file, evidence }[]`；`gitWorktreeEvidenceDirectories`、`createGitWorktreeEvidenceReader`、`inspectGitWorktrees` 等现有入口保持不变，继续服务需要完整核对的调用方。

### 2. 读者用证据直接定位项目检出，替代逐项目 `inspectGitWorktrees`

`publication-worktree-reader.list()` 的新流程：

1. `listGitWorktreeEvidence(root)` 得到全部已登记证据（taskId → repositories）。
2. 每任务 `taskQuery.readTask` 取得 scope（projects + services + changes），与现行一致。
3. 每个项目按证据 selector 解析项目检出根：
   - `project:<code>` → 该 evidence repository 的 `checkoutPath`；
   - `workspace`（sourcePath `.`）→ `checkoutPath + project.source.path`；
   - 仅 `service:<p>/<s>` 覆盖时：沿用 `resolveTaskProjectDocument` 的 service 回退语义——保留仓文章目录位于该 service `sourcePath` 之下时，`checkoutPath + 相对部分` 即项目来源；否则该项目本任务无工作树来源，跳过。
4. 文件系统身份探针（每个被使用的检出）：`checkoutPath/.git` 必须是文件（linked worktree 形态），其 `gitdir:` 解析后须落在该记录 `sourceRepository` 的 common dir 内，且 `gitdir/HEAD` 指向 `refs/heads/<record.branch>`。不满足 → 该来源跳过 + `publication_worktree_unavailable` 诊断，不退回主目录稿件。
5. `readPublicationEntries`、`unchanged` 基线对比、`observe` revision、`candidate` 草稿标记全部保持现状——这些本来就是纯文件/纯计算。

### 3. 为什么不做"更便宜的全核对"

备选：保留核对但复用发现结果/合并 rev-parse 参数/去掉 status——能把 ~2.5s 压到 ~0.9–1.1s，但仍是每次列表十几次 spawn 且阻塞事件循环，仓数量大时同样劣化；而 spec 对"访问时核对"的要求意味着列出前核对本身就是重复工作。文件系统探针覆盖了草稿发现真正需要的身份保证（位置归属 + 分支），其余风险（登记后被整体替换等）由访问时刻的完整核对兜底，行为差异只有"列表短暂漏显示/显示前漂移"这一档。

### 4. 失效与诊断语义

- 证据目录扫描异常 → 沿用现有 `publication_worktree_unavailable` 局部诊断；同 taskId 冲突证据 → `git_worktree_evidence_conflict` 语义不变。
- 项目无工作树来源（provenance 等价于现行 `retained-project`）→ 与现行一致地静默跳过。
- fs 探针失败 → 该来源跳过 + 诊断；产出条目不出现该来源的草稿。

## Risks / Trade-offs

- [文件系统模仿 Git 布局的语义不完整（如 `GIT_DIR` 环境、`.git` 非标准指向）] → 只用于"是否列出草稿"的发现判断；解析失败一律按未发现处理；读写路径仍走 git 权威核对。
- [列表显示后、打开前的窗口内工作树漂移] → 打开/编辑/保存的完整核对照旧拒绝，错误经既有 404/409 呈现；spec 已要求访问时重新核对。
- [同一任务证据存在于多个 common dir 时 fs 枚举顺序不同] → 按 taskId 去重 + 冲突即报，与现行 `findGitWorktreeEvidenceFile` 的多份证据语义一致。

## Migration Plan

无数据或配置迁移；行为变化仅限列表发现依据，发布后回退即恢复原实现。
